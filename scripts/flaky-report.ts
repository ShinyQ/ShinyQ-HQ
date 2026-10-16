/**
 * Flaky tests for CI job pages: every test that failed and then passed on its retry (Playwright status
 * "flaky") in a merged JSON report. Never fails the job: the tests stay blocking, and a flaky test gets an
 * issue with an owner instead of a quarantine or more retries (docs/agents/performance.md, "Fast verification").
 *
 *   bun scripts/flaky-report.ts <report.json> [--lane E2E]
 *
 * Appends Markdown to $GITHUB_STEP_SUMMARY when it is set (else prints it) and prints one `::warning::`
 * line per flaky test. A missing report prints a notice. Imports only node: modules.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";

interface JsonResult {
  status: string;
  duration: number;
  retry?: number;
  error?: { message?: string };
  errors?: { message?: string }[];
}
interface JsonSpec {
  title: string;
  file: string;
  line: number;
  tests: { status: string; results: JsonResult[] }[];
}
interface JsonSuite {
  title: string;
  specs?: JsonSpec[];
  suites?: JsonSuite[];
}
export interface JsonReport {
  suites: JsonSuite[];
  stats?: { expected?: number; unexpected?: number; flaky?: number; skipped?: number };
}

export interface FlakyAttempt {
  status: string;
  seconds: number;
  error: string;
}
export interface FlakyTest {
  file: string;
  line: number;
  title: string;
  attempts: FlakyAttempt[];
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** The first line of an error plus its locator line, without terminal colours, at most 160 characters. */
export function errorLine(message: string | undefined): string {
  const lines = (message ?? "").replace(ANSI, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const locator = lines.find((l) => l.startsWith("Locator:"));
  const line = [lines[0] ?? "", locator].filter(Boolean).join("; ");
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

function walk(suite: JsonSuite, titles: string[], out: FlakyTest[]) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      if (test.status !== "flaky") continue;
      out.push({
        file: spec.file,
        line: spec.line,
        title: [...titles, spec.title].join(" › "),
        attempts: test.results.map((r) => ({
          status: r.status,
          seconds: Math.round(r.duration / 100) / 10,
          error: errorLine(r.error?.message ?? r.errors?.[0]?.message),
        })),
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, [...titles, child.title], out);
}

/** Tests that passed only on a retry, in report order. Top-level suites are files, not describe blocks. */
export function flakyTests(report: JsonReport): FlakyTest[] {
  const out: FlakyTest[] = [];
  for (const file of report.suites) walk(file, [], out);
  return out;
}

const cell = (s: string) => s.replace(/\|/g, "\\|");

/** The job summary section for one lane. */
export function flakyMarkdown(flaky: readonly FlakyTest[], lane: string, report?: JsonReport): string {
  const s = report?.stats;
  const ran = s ? (s.expected ?? 0) + (s.unexpected ?? 0) + (s.flaky ?? 0) : undefined;
  const header = `### ${lane}: tests that passed only on retry\n\n`;
  if (flaky.length === 0) return `${header}None${ran !== undefined ? ` (${ran} tests ran)` : ""}.\n`;
  const rows = flaky.map((t) => {
    const failed = t.attempts.filter((a) => a.status !== "passed");
    const passed = t.attempts.find((a) => a.status === "passed");
    const fail = failed.map((a) => `${a.seconds} s: ${a.error || a.status}`).join("<br>");
    return `| \`${t.file}:${t.line}\` ${cell(t.title)} | ${cell(fail)} | ${passed ? `${passed.seconds} s` : ""} |`;
  });
  return [
    `${header}${flaky.length} flaky${ran !== undefined ? ` of ${ran} tests that ran` : ""}. Each needs an issue with an owner; no quarantine and no extra retries.\n`,
    "| Test | Failed attempt | Passed retry |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  const laneAt = argv.indexOf("--lane");
  const lane = laneAt >= 0 && argv[laneAt + 1] ? argv[laneAt + 1] : "E2E";
  const file = argv.find((a, i) => !a.startsWith("--") && (laneAt < 0 || i !== laneAt + 1));
  let markdown: string;
  if (!file || !existsSync(file)) {
    console.log(`::notice::No ${lane} JSON report${file ? ` at ${file}` : ""}; flaky summary skipped.`);
    markdown = `### ${lane}: tests that passed only on retry\n\nNo report to read.\n`;
  } else {
    const report = JSON.parse(readFileSync(file, "utf8")) as JsonReport;
    const flaky = flakyTests(report);
    for (const t of flaky) {
      const first = t.attempts.find((a) => a.status !== "passed");
      console.log(`::warning title=Flaky test (${lane})::${t.file}:${t.line} ${t.title} passed only on retry${first?.error ? `; first attempt: ${first.error}` : ""}`);
    }
    markdown = flakyMarkdown(flaky, lane, report);
  }
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `${markdown}\n`);
  else console.log(markdown);
}

if (import.meta.main) main();
