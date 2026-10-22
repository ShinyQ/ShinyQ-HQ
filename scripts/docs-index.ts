/**
 * Read-time index of the owner decisions (docs/decisions/, one file per decision) and the superpowers plans (each
 * plan's own `Status:` line). Prints markdown tables to stdout and commits nothing, so parallel PRs that each add
 * a decision and a plan never edit the same lines (docs/superpowers/plans/2026-10-18-conflict-free-docs.md).
 *
 *   bun scripts/docs-index.ts              both tables
 *   bun scripts/docs-index.ts decisions    the decisions log
 *   bun scripts/docs-index.ts plans        the plans with status and PRs
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const DECISIONS_DIR = "docs/decisions";
export const PLANS_DIR = "docs/superpowers/plans";
export const DECISION_FILE = /^(\d{4}-\d{2}(?:-\d{2})?)-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
export const PR_LINK = /^\[#(\d+)\]\(https:\/\/github\.com\/ShinyQ\/ShinyQ-HQ\/pull\/(\d+)\)$/;
/** The status line sits under the title or after the agentic-workers note. */
export const STATUS_WITHIN_LINES = 12;

export type Decision = { file: string; date: string; area: string; pr: string; text: string };
export type PlanCategory = "shipped" | "shipped, later changed" | "in progress" | "dropped";
export type Plan = { file: string; title: string; status: string; category: PlanCategory | null; prs: number[] };

/** Parses one decision file; throws with the reason when the file breaks the format. */
export function parseDecision(file: string, markdown: string): Decision {
  const fail = (why: string): never => {
    throw new Error(`${file}: ${why}`);
  };
  const name = DECISION_FILE.exec(file) ?? fail("name is not YYYY-MM-DD-slug.md (or YYYY-MM-slug.md)");
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const area = /^# (\S.*)$/.exec(lines[0] ?? "")?.[1].trim() ?? fail("first line is not an `# Area` heading");
  if (lines[1] !== "") fail("no blank line after the heading");
  let i = 2;
  const meta: Record<string, string> = {};
  for (; i < lines.length && lines[i].startsWith("- "); i++) {
    const m = /^- (Date|PR): (.+)$/.exec(lines[i]) ?? fail(`unknown metadata line "${lines[i]}" (use "- Date:" and "- PR:")`);
    if (meta[m[1]] !== undefined) fail(`"${m[1]}" twice`);
    meta[m[1]] = m[2].trim();
  }
  const date = meta.Date ?? fail("no `- Date:` line");
  if (date !== name[1]) fail(`Date ${date} does not match the file name prefix ${name[1]}`);
  const pr = meta.PR ?? "";
  if (pr) {
    for (const link of pr.split(", ")) {
      const m = PR_LINK.exec(link);
      if (!m || m[1] !== m[2]) fail(`PR "${link}" is not [#N](https://github.com/ShinyQ/ShinyQ-HQ/pull/N)`);
    }
  }
  if (lines[i] !== "") fail("no blank line after the metadata");
  const text = lines
    .slice(i + 1)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ");
  if (!text) fail("no decision text");
  return { file, date, area, pr, text };
}

/** The `Status:` text of a plan (after the label), or null when it has none near the top. */
export function statusLine(markdown: string): string | null {
  const line = markdown.split("\n").slice(0, STATUS_WITHIN_LINES).find((l) => l.startsWith("Status: "));
  return line ? line.slice("Status: ".length).trim() : null;
}

/** Derives the plan category from its status text; null when the text names no known state. */
export function planCategory(status: string): PlanCategory | null {
  const s = status.toLowerCase();
  if (/^(?:part \d+ )?(?:in review|in progress|planned)\b/.test(s)) return "in progress";
  if (/^dropped\b/.test(s)) return "dropped";
  if (!/\b(?:shipped|implemented)\b/.test(s)) return null;
  return /\blater (?:removed|replaced)\b|\breverted\b/.test(s) ? "shipped, later changed" : "shipped";
}

/** PR numbers referenced by a status line, first mention first. */
export function statusPrs(status: string): number[] {
  return [...new Set([...status.matchAll(/#(\d+)\b/g)].map((m) => Number(m[1])))];
}

export function listDecisions(root = process.cwd()): Decision[] {
  const dir = path.join(root, DECISIONS_DIR);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseDecision(f, readFileSync(path.join(dir, f), "utf8")))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.area.localeCompare(b.area) || a.file.localeCompare(b.file)));
}

export function listPlans(root = process.cwd()): Plan[] {
  const dir = path.join(root, PLANS_DIR);
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".md"))
    .map((d) => d.name)
    .sort()
    .map((file) => {
      const markdown = readFileSync(path.join(dir, file), "utf8");
      const status = statusLine(markdown) ?? "";
      return {
        file,
        title: /^# (.+)$/m.exec(markdown)?.[1].trim() ?? file,
        status,
        category: status ? planCategory(status) : null,
        prs: statusPrs(status),
      };
    });
}

const cell = (s: string) => s.replace(/\|/g, "\\|");
const prLink = (n: number) => `[#${n}](https://github.com/ShinyQ/ShinyQ-HQ/pull/${n})`;

export function decisionRow(d: Decision): string {
  return `| ${d.date} | ${cell(d.area)} | ${cell(d.text)} | ${d.pr} |`;
}

export function renderDecisions(decisions: Decision[]): string {
  return [`${decisions.length} owner decisions (\`${DECISIONS_DIR}/\`).`, "", "| Date | Area | Decision | PR |", "|---|---|---|---|", ...decisions.map(decisionRow)].join("\n");
}

export function renderPlans(plans: Plan[]): string {
  const count = (c: PlanCategory) => plans.filter((p) => p.category === c).length;
  const summary = `${plans.length} plans: ${count("shipped")} shipped and still current, ${count("shipped, later changed")} shipped with a part later removed or replaced, ${count("in progress")} in progress or in review, ${count("dropped")} dropped before shipping.`;
  const rows = plans.map((p) => `| [${cell(p.title)}](plans/${p.file}) | ${p.category ?? "unknown"} | ${p.prs.map(prLink).join(", ")} |`);
  return [summary, "", "| Plan | Status | PR |", "|---|---|---|", ...rows].join("\n");
}

if (import.meta.main) {
  const which = process.argv[2];
  if (which && which !== "decisions" && which !== "plans") {
    console.error("Usage: bun scripts/docs-index.ts [decisions|plans]");
    process.exit(2);
  }
  const out: string[] = [];
  if (which !== "plans") out.push("## Owner decisions", "", renderDecisions(listDecisions()));
  if (which !== "decisions") out.push(...(out.length ? [""] : []), "## Plans", "", renderPlans(listPlans()));
  console.log(out.join("\n"));
}
