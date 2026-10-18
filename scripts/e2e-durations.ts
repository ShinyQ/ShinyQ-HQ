/**
 * Refreshes e2e/durations.json (seconds per test for the duration-balanced CI shards) from real CI timings:
 * the `list` reporter lines in the logs of the `E2E shard` and `3D perf gates` jobs of green CI runs.
 * Usage: bun scripts/e2e-durations.ts [--runs 5] [--branch main] [--event schedule] [run ids...]
 *
 * Without run ids it takes the last `--runs` successful `ci.yml` runs of `--event` on `--branch` that ran tests: the
 * nightly schedule by default, the only runs that cover every test (pushes to main run the complement of their pull
 * request's run, which may be no test at all, and pull requests and pushes skip the nightly-only `@nightly` tests).
 * Needs `gh` (or GH_TOKEN) with
 * read access to the repository (`GH_REPO` or the current checkout). Each test gets its median over the
 * runs (passes only, a pass on retry included; skipped tests count as 0), after dividing each job's samples by
 * its runner speed factor (`normalizeRunnerSpeed`: GitHub runners differ in CPU speed, and every test of a
 * shard runs at about its runner's factor), so the numbers are a median-speed runner's. Commit the result; rerun it when
 * shards drift apart in CI (compare the `E2E shard n/8` job times).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { medianDurations, normalizeRunnerSpeed, parseListReporter, parseRunnerLine, type DurationSample, type DurationsFile } from "./e2e-plan";

const OUT = path.join(import.meta.dir, "..", "e2e", "durations.json");

function gh(args: string[]): string {
  const result = Bun.spawnSync(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`gh ${args.join(" ")} failed: ${result.stderr.toString().trim()}`);
  return result.stdout.toString();
}

/** Job logs through the REST API (they contain terminal escapes that `gh api` refuses to print). */
async function jobLog(repo: string, job: number, token: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${job}/logs`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`job ${job} logs: HTTP ${res.status}`);
  return res.text();
}

function option(argv: string[], name: string, fallback: string): string {
  const at = argv.indexOf(name);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
}

async function main() {
  const argv = process.argv.slice(2);
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? gh(["auth", "token"]).trim();
  const repo = process.env.GH_REPO ?? gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).trim();
  const count = Number(option(argv, "--runs", "5"));
  const branch = option(argv, "--branch", "main");
  const event = option(argv, "--event", "schedule");
  const optionValues = new Set([option(argv, "--runs", ""), option(argv, "--branch", ""), option(argv, "--event", "")]);
  const explicit = argv.filter((a) => /^\d+$/.test(a) && !optionValues.has(a)).map(Number);
  let candidates = explicit;
  if (candidates.length === 0) {
    // A run can hold no test result (a complement push whose PR covered everything), so list extra runs and keep the first `count` with tests.
    const listed = gh(["run", "list", "-R", repo, "--workflow", "ci.yml", "--branch", branch, "--event", event, "--status", "success", "--limit", String(count * 4), "--json", "databaseId", "--jq", ".[].databaseId"]);
    candidates = listed.split(/\s+/).filter(Boolean).map(Number);
  }
  const runs: number[] = [];
  const jobSamples: DurationSample[][] = [];
  const labels: string[] = [];
  for (const run of candidates) {
    if (explicit.length === 0 && runs.length >= count) break;
    const jobs = JSON.parse(gh(["api", `repos/${repo}/actions/runs/${run}/jobs?per_page=100`])) as { jobs: { id: number; name: string; conclusion: string }[] };
    const shardJobs = jobs.jobs.filter((j) => /^(E2E shard|3D perf gates) /.test(j.name));
    const runSamples: DurationSample[][] = [];
    const runLabels: string[] = [];
    for (const job of shardJobs) {
      const log = await jobLog(repo, job.id, token);
      runSamples.push(parseListReporter(log));
      runLabels.push(`run ${run} ${job.name}: ${runSamples.at(-1)?.length ?? 0} tests, runner ${parseRunnerLine(log) ?? "not logged"}`);
    }
    if (runSamples.every((s) => s.length === 0)) {
      console.log(`run ${run}: no test results, skipped`);
      continue;
    }
    runs.push(run);
    jobSamples.push(...runSamples);
    labels.push(...runLabels);
  }
  if (runs.length === 0) throw new Error("no CI runs with test results to read");
  const { samples, factors } = normalizeRunnerSpeed(jobSamples);
  labels.forEach((label, i) => console.log(`${label}, speed factor ${factors[i]}`));
  const medians = medianDurations(samples);
  const file: DurationsFile = {
    source: "scripts/e2e-durations.ts: median seconds per test from the list reporter in these CI runs' E2E shard and 3D perf gates logs, each job scaled by its runner speed factor",
    runs,
    e2e: medians.e2e,
    perf: medians.perf,
  };
  writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${Object.keys(medians.e2e).length} e2e and ${Object.keys(medians.perf).length} perf tests from ${runs.length} runs`);
}

await main();
