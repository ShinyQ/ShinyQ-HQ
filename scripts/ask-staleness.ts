/**
 * Freshness guard (spec section 6.3). Warns, never fails, when the live facts or the main content
 * file are older than 45 days, so the Ask the HQ answers do not quietly age.
 *
 *   bun scripts/ask-staleness.ts [--report <file>]
 *
 * Prints `::warning::` lines in GitHub Actions, writes a Markdown report (default
 * ask-staleness.md) and sets the step output `stale=true|false`. Always exits 0.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const MAX_AGE_DAYS = 45;
export const COMMENT_MARKER = "<!-- ask-staleness -->";

export interface Section {
  name: string;
  /** YYYY-MM-DD, or undefined when it could not be determined. */
  date?: string;
  hint: string;
}

export interface StaleItem extends Section {
  ageDays: number;
}

export function ageInDays(date: string, today: string): number {
  return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}

export function findStale(sections: readonly Section[], today: string, maxAgeDays = MAX_AGE_DAYS): StaleItem[] {
  return sections
    .filter((s): s is Section & { date: string } => Boolean(s.date && /^\d{4}-\d{2}-\d{2}$/.test(s.date)))
    .map((s) => ({ ...s, ageDays: ageInDays(s.date, today) }))
    .filter((s) => s.ageDays > maxAgeDays);
}

export function formatStaleReport(items: readonly StaleItem[], maxAgeDays = MAX_AGE_DAYS): string {
  if (!items.length) return `${COMMENT_MARKER}\nAsk the HQ data is fresh (everything changed within ${maxAgeDays} days).\n`;
  return [
    COMMENT_MARKER,
    `**Ask the HQ data is getting stale** (older than ${maxAgeDays} days). Answers say "as of" these dates, so consider a refresh:`,
    "",
    ...items.map((i) => `- **${i.name}**: last updated ${i.date} (${i.ageDays} days ago). ${i.hint}`),
    "",
    "This is a warning only; it never blocks the PR. Checklist: AGENTS.md, section \"Ask the HQ\".",
    "",
  ].join("\n");
}

function gitDate(file: string): string | undefined {
  const shallow = Bun.spawnSync(["git", "rev-parse", "--is-shallow-repository"], { stdout: "pipe" }).stdout.toString().trim();
  if (shallow === "true") {
    console.log(`::notice::Shallow clone; cannot date ${file} (check out with fetch-depth: 0).`);
    return undefined;
  }
  const run = Bun.spawnSync(["git", "log", "-1", "--format=%cs", "--", file], { stdout: "pipe", stderr: "ignore" });
  return run.exitCode === 0 ? run.stdout.toString().trim() || undefined : undefined;
}

function main() {
  const args = process.argv.slice(2);
  const reportFile = args.includes("--report") ? args[args.indexOf("--report") + 1] : "ask-staleness.md";
  const today = new Date().toISOString().slice(0, 10);
  const facts = JSON.parse(readFileSync(path.join(process.cwd(), "content", "generated", "dynamic-facts.json"), "utf8")) as { asOf?: string };

  const sections: Section[] = [
    { name: "Live facts (content/generated/dynamic-facts.json)", date: facts.asOf, hint: "Run the Refresh live facts workflow (Actions > Refresh live facts > Run workflow)." },
    { name: "Site content (content/site-content.json)", date: gitDate("content/site-content.json"), hint: "Review the current role, availability, projects, certifications and posts." },
  ];
  const stale = findStale(sections, today);
  for (const item of stale) console.log(`::warning::${item.name} is ${item.ageDays} days old (${item.date}).`);
  const report = formatStaleReport(stale);
  console.log(report);
  writeFileSync(reportFile, report);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `stale=${stale.length > 0}\n`);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.log(`::warning::Staleness check skipped: ${(error as Error).message}`);
  }
}
