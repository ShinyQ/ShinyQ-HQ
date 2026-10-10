/**
 * Runs one CI shard of the e2e suite with a balanced test list.
 * Usage: bun scripts/e2e-shard.ts 2/4 [extra playwright args]
 *
 * Lists the suite (`playwright test --list`), keeps every Nth test (scripts/e2e-plan.ts) and runs
 * them with `--test-list`. E2E_SHARD makes playwright.config.ts write a blob report for merging.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assignShard, parseShard } from "./e2e-plan";

interface ListSuite {
  title: string;
  file: string;
  specs?: { title: string; file: string; tests: { projectName: string }[] }[];
  suites?: ListSuite[];
}

function collect(suite: ListSuite, titles: string[], out: string[]) {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests) out.push(`[${t.projectName}] › ${spec.file} › ${[...titles, spec.title].join(" › ")}`);
  }
  for (const child of suite.suites ?? []) collect(child, [...titles, child.title], out);
}

function listTests(): string[] {
  const env = { ...process.env, E2E_SHARD: "" };
  const result = Bun.spawnSync(["bunx", "playwright", "test", "--list", "--reporter=json"], { env, stdout: "pipe", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error(`playwright --list failed with exit code ${result.exitCode}`);
  const report = JSON.parse(result.stdout.toString()) as { suites: ListSuite[] };
  const tests: string[] = [];
  // Top-level suites are files; their title is the file name, not a describe block.
  for (const file of report.suites) collect(file, [], tests);
  return tests;
}

function main() {
  const [shardArg, ...rest] = process.argv.slice(2);
  if (!shardArg) {
    console.error("usage: bun scripts/e2e-shard.ts <index>/<total> [playwright args]");
    process.exit(2);
  }
  const { index, total } = parseShard(shardArg);
  const all = listTests();
  const mine = assignShard(all, index, total);
  console.log(`e2e shard ${index}/${total}: ${mine.length} of ${all.length} tests`);
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
