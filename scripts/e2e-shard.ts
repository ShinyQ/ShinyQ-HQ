/**
 * Runs one CI shard of the e2e suite (or of the perf lane with PERF=1) with a duration-balanced test list.
 * Usage: bun scripts/e2e-shard.ts 2/4 [extra playwright args]
 *        PERF=1 bun scripts/e2e-shard.ts 1/2 --grep-invert "@nightly|@look"   (`bun run e2e:perf:shard 1/2`)
 *        bun scripts/e2e-shard.ts 1/4 --dry   (prints every shard's size and estimate, runs nothing)
 *
 * Lists the suite (`playwright test --list`, with the same extra args), splits it with planShards
 * (scripts/e2e-plan.ts: longest test first onto the least-loaded of the shards' 2 workers each, from
 * e2e/durations.json; round-robin when the file is missing) and runs this shard's tests with `--test-list`.
 * It logs a runner fingerprint (CPU model and a hash benchmark): runner speed varies between GitHub runners,
 * and scripts/e2e-durations.ts reads it next to each job's speed factor. E2E_SHARD makes
 * playwright.config.ts write a blob report for merging. Refresh the durations with scripts/e2e-durations.ts.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import path from "node:path";
import { CI_WORKERS_PER_SHARD, listTestIds, parseShard, planShards, shardSeconds, shardWallSeconds, type Durations, type DurationsFile, type ListSuite } from "./e2e-plan";

const DURATIONS = path.join(import.meta.dir, "..", "e2e", "durations.json");

function listTests(args: string[]): string[] {
  const env = { ...process.env, E2E_SHARD: "" };
  // A selection can match no test: a spec whose tests are all nightly-only under `--grep-invert @nightly`.
  const result = Bun.spawnSync(["bunx", "playwright", "test", "--list", "--pass-with-no-tests", "--reporter=json", ...args], { env, stdout: "pipe", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error(`playwright --list failed with exit code ${result.exitCode}`);
  return listTestIds(JSON.parse(result.stdout.toString()) as { suites: ListSuite[] });
}

/** CPU count and model plus SHA-256 throughput over 64 MB: GitHub runners differ in speed by up to about 1.9x. */
function runnerFingerprint(): string {
  const list = cpus();
  const block = Buffer.alloc(8 * 1024 * 1024, 7);
  const start = performance.now();
  const hash = createHash("sha256");
  for (let i = 0; i < 8; i++) hash.update(block);
  hash.digest();
  const mbPerSecond = Math.round(64 / ((performance.now() - start) / 1000));
  return `${list.length} x ${list[0]?.model.trim() ?? "unknown CPU"}, sha256 ${mbPerSecond} MB/s`;
}

function loadDurations(): Durations | null {
  if (!existsSync(DURATIONS)) return null;
  const file = JSON.parse(readFileSync(DURATIONS, "utf8")) as DurationsFile;
  return (process.env.PERF ? file.perf : file.e2e) ?? null;
}

function main() {
  const argv = process.argv.slice(2);
  const shardAt = argv.findIndex((a) => /^\d+\/\d+$/.test(a));
  if (shardAt < 0) {
    console.error("usage: bun scripts/e2e-shard.ts <index>/<total> [--dry] [playwright args]");
    process.exit(2);
  }
  const { index, total } = parseShard(argv[shardAt]);
  const dry = argv.includes("--dry");
  const rest = argv.filter((a, i) => i !== shardAt && a !== "--dry");
  const lane = process.env.PERF ? "perf lane" : "e2e";
  const durations = loadDurations();
  const all = listTests(rest);
  const shards = planShards(all, total, durations, CI_WORKERS_PER_SHARD);
  // Every listed test runs in exactly one shard (also unit tested against the real list).
  const planned = shards.flat();
  if (planned.length !== all.length || new Set(planned).size !== new Set(all).size) {
    throw new Error(`shard plan lost or duplicated tests: ${planned.length} planned, ${all.length} listed`);
  }
  const how = durations ? "duration-balanced (e2e/durations.json)" : "round-robin (no e2e/durations.json)";
  if (dry) {
    shards.forEach((s, i) => console.log(`${lane} shard ${i + 1}/${total}: ${s.length} tests, about ${Math.round(shardSeconds(s, durations))} worker-s, ${Math.round(shardWallSeconds(s, durations, CI_WORKERS_PER_SHARD))} s on ${CI_WORKERS_PER_SHARD} workers`));
    console.log(`${all.length} tests, ${how}`);
    return;
  }
  const mine = shards[index - 1];
  console.log(`${lane} shard ${index}/${total}: ${mine.length} of ${all.length} tests, about ${Math.round(shardSeconds(mine, durations))} worker-s, ${Math.round(shardWallSeconds(mine, durations, CI_WORKERS_PER_SHARD))} s on ${CI_WORKERS_PER_SHARD} workers, ${how}`);
  console.log(`runner: ${runnerFingerprint()}`);
  if (mine.length === 0) return;
  const listFile = path.join(mkdtempSync(path.join(tmpdir(), "hq-e2e-")), `shard-${index}-of-${total}.txt`);
  writeFileSync(listFile, `${mine.join("\n")}\n`);
  const run = Bun.spawnSync(["bunx", "playwright", "test", "--test-list", listFile, ...rest], {
    env: { ...process.env, E2E_SHARD: `${index}/${total}` },
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(run.exitCode ?? 1);
}

main();
