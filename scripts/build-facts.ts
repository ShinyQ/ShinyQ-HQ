/**
 * Build-time facts snapshot: numbers measured from the repository (git history, test and doc counts,
 * CI jobs, the 3D budgets) for /[locale]/build and the B1 Engine Room floor.
 *
 *   bun scripts/build-facts.ts [--write] [--no-runners]
 *
 * Prints the JSON. `--write` writes content/generated/build-facts.json only when it differs (validated
 * by BuildFactsSchema). Everything is deterministic per commit: dates are UTC committer dates and the
 * history is the first-parent line of HEAD (never `main`, which may be stale locally). A shallow clone
 * cannot give honest git numbers, so the committed snapshot is kept (CI checks out with fetch-depth 0).
 * The test runners (`vitest list`, `playwright test --list`) only enumerate; a failure warns and omits that number.
 * `--write` with `--no-runners` is rejected (it would drop the runner counts from the committed file).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BYTES_3D_BUDGET, RENDER_BUDGET } from "../e2e/budgets";
import { BuildFactsSchema, getBuildStory, type BuildFacts } from "../src/content/build-story";

export const FACTS_FILE = path.join(process.cwd(), "content", "generated", "build-facts.json");

const RUNNER_TIMEOUT_MS = 120_000;

/**
 * playwright.config.ts: testDir `e2e`, with `e2e/perf/` (PERF=1 only) and the screenshot specs
 * (SCREENSHOTS=1 only) ignored, so the file count matches what the default suite runs.
 */
const PLAYWRIGHT_ONLY_WHEN_FLAGGED = new Set(["screenshots.spec.ts", "pageview-visual.spec.ts", "delivery-visual.spec.ts"]);

type Rounds = { id: string; prs: { from: number; to: number | null } }[];
type PrDate = { n: number; date: string };
export type GitFacts = Pick<BuildFacts, "generatedAt" | "commit" | "git"> & { prs: PrDate[] };

/** Trailing `(#N)` of each subject (the squash-merge suffix), unique and ascending. */
export function parsePrNumbers(subjects: string[]): number[] {
  const found = new Set<number>();
  for (const subject of subjects) {
    const match = /\(#(\d+)\)\s*$/.exec(subject.trim());
    if (match) found.add(Number(match[1]));
  }
  return [...found].sort((a, b) => a - b);
}

/** The PRs inside each round's range, with the first and last date (ISO dates compare as strings). */
export function assignRounds(prs: PrDate[], rounds: Rounds): NonNullable<BuildFacts["rounds"]> {
  return rounds.map((round) => {
    const inRound = prs.filter((pr) => pr.n >= round.prs.from && (round.prs.to === null || pr.n <= round.prs.to)).sort((a, b) => a.n - b.n);
    const dates = inRound.map((pr) => pr.date).sort();
    return { id: round.id, prs: inRound.map((pr) => pr.n), ...(dates.length ? { first: dates[0], last: dates[dates.length - 1] } : {}) };
  });
}

/** Job display names of a workflow: the 4-space `name:` lines under `jobs:`, in file order. */
export function parseCiJobs(yaml: string): string[] {
  const names: string[] = [];
  let inJobs = false;
  for (const line of yaml.split("\n")) {
    if (/^jobs:\s*$/.test(line)) inJobs = true;
    else if (/^\S/.test(line)) inJobs = false;
    else if (inJobs) {
      const match = /^ {4}name:\s*(.+?)\s*$/.exec(line);
      if (match) names.push(match[1].replace(/^(["'])(.*)\1$/, "$2"));
    }
  }
  return names;
}

/** `Total: 580 tests in 46 files` from `playwright test --list`. */
export function parsePlaywrightList(stdout: string): { tests: number; files: number } | undefined {
  const match = /Total:\s*(\d+)\s+tests?\s+in\s+(\d+)\s+files?/.exec(stdout);
  return match ? { tests: Number(match[1]), files: Number(match[2]) } : undefined;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, TZ: "UTC" }, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).trim();
}

/** Git numbers from the first-parent history of HEAD; undefined for a shallow clone, a non-git directory or no commits. */
export function gitFacts(cwd: string): GitFacts | undefined {
  try {
    if (git(cwd, ["rev-parse", "--is-shallow-repository"]) === "true") return undefined;
    const date = "--date=format-local:%Y-%m-%d";
    const generatedAt = git(cwd, ["log", "-1", "--format=%cd", date, "HEAD"]);
    const commit = git(cwd, ["rev-parse", "--short=7", "HEAD"]);
    const commits = Number(git(cwd, ["rev-list", "--count", "HEAD"]));
    const roots = git(cwd, ["log", "--max-parents=0", "--format=%cd", date, "HEAD"]).split("\n").filter(Boolean).sort();
    const firstParent = git(cwd, ["log", "--first-parent", "--format=%cd%x09%s", date, "HEAD"]).split("\n").filter(Boolean);
    const dateOf = new Map<number, string>();
    for (const row of firstParent) {
      const [when, ...subject] = row.split("\t");
      for (const n of parsePrNumbers([subject.join("\t")])) if (!dateOf.has(n)) dateOf.set(n, when);
    }
    const prs = [...dateOf].map(([n, when]) => ({ n, date: when })).sort((a, b) => a.n - b.n);
    if (!generatedAt || !roots.length || !Number.isInteger(commits)) return undefined;
    return { generatedAt, commit, git: { commits, firstCommit: roots[0], mergedPrs: prs.length, latestPr: prs.at(-1)?.n ?? 0 }, prs };
  } catch {
    return undefined;
  }
}

function walk(dir: string, keep: (file: string, relative: string) => boolean, base = dir): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += entry.name === "node_modules" ? 0 : walk(full, keep, base);
    else if (keep(entry.name, path.relative(base, full).split(path.sep).join("/"))) total++;
  }
  return total;
}

function runner(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync("bunx", args, { cwd, encoding: "utf8", timeout: RUNNER_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return undefined;
  }
}

function vitestTests(cwd: string): number | undefined {
  const out = runner(cwd, ["vitest", "list", "--json"]);
  let count: number | undefined;
  try {
    const list: unknown = out === undefined ? undefined : JSON.parse(out);
    count = Array.isArray(list) ? list.length : undefined;
  } catch {
    count = undefined;
  }
  if (count === undefined) console.warn("build-facts: `vitest list --json` failed or was not parseable, omitting tests.unit");
  return count;
}

function playwrightTests(cwd: string): number | undefined {
  const out = runner(cwd, ["playwright", "test", "--list"]);
  const count = out === undefined ? undefined : parsePlaywrightList(out)?.tests;
  if (count === undefined) console.warn("build-facts: `playwright test --list` failed or was not parseable, omitting tests.e2e");
  return count;
}

const kb = (bytes: number) => Math.round((bytes / 1024) * 10) / 10;

/** Throws when git history is unavailable (shallow, not a repository): callers keep the committed snapshot. */
export function collectFacts(cwd: string, opts: { runners: boolean; rounds?: Rounds; git?: GitFacts }): BuildFacts {
  const git = opts.git ?? gitFacts(cwd);
  if (!git) throw new Error("Git history is unavailable (shallow clone or not a repository)");
  const { prs, ...gitPart } = git;
  const rounds = opts.rounds ?? getBuildStory().stations.timeline.rounds;

  const workflows = path.join(cwd, ".github", "workflows");
  const ciFile = path.join(workflows, "ci.yml");
  const jobs = existsSync(ciFile) ? parseCiJobs(readFileSync(ciFile, "utf8")) : [];
  const workflowCount = existsSync(workflows) ? readdirSync(workflows).filter((f) => f.endsWith(".yml")).length : 0;

  const unit = opts.runners ? vitestTests(cwd) : undefined;
  const e2e = opts.runners ? playwrightTests(cwd) : undefined;

  const facts = {
    generatedAt: gitPart.generatedAt,
    commit: gitPart.commit,
    git: gitPart.git,
    rounds: assignRounds(prs, rounds),
    tests: {
      ...(unit === undefined ? {} : { unit }),
      unitFiles: walk(path.join(cwd, "tests"), (name) => name.endsWith(".test.ts")),
      ...(e2e === undefined ? {} : { e2e }),
      e2eFiles: walk(path.join(cwd, "e2e"), (name, rel) => name.endsWith(".spec.ts") && !rel.startsWith("perf/") && !PLAYWRIGHT_ONLY_WHEN_FLAGGED.has(name)),
    },
    docs: {
      specs: walk(path.join(cwd, "docs", "superpowers", "specs"), (name) => name.endsWith(".md")),
      plans: walk(path.join(cwd, "docs", "superpowers", "plans"), (name, rel) => name.endsWith(".md") && !rel.includes("/")),
    },
    ...(jobs.length ? { ci: { jobs, workflows: workflowCount } } : {}),
    budgets: {
      js3dKb: kb(BYTES_3D_BUDGET.failAt),
      sessionFullKb: kb(BYTES_3D_BUDGET.session.full),
      sceneCalls: RENDER_BUDGET.sceneCalls,
      triangles: RENDER_BUDGET.triangles,
      floorChunkKb: Object.fromEntries(Object.entries(BYTES_3D_BUDGET.floors).map(([floor, bytes]) => [floor, kb(bytes)])),
    },
  };
  return BuildFactsSchema.parse(facts);
}

export function serialize(facts: BuildFacts): string {
  return `${JSON.stringify(facts, null, 2)}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const cwd = process.cwd();
  if (args.includes("--write") && args.includes("--no-runners")) {
    console.error("build-facts: --write cannot be combined with --no-runners (it would drop tests.unit and tests.e2e from the committed file)");
    process.exit(1);
  }
  const git = gitFacts(cwd);
  if (!git) {
    console.log(`build-facts: git history is unavailable (shallow clone?), keeping ${path.relative(cwd, FACTS_FILE)}`);
    return;
  }
  const json = serialize(collectFacts(cwd, { runners: !args.includes("--no-runners"), git }));
  process.stdout.write(json);
  if (args.includes("--write")) {
    const current = existsSync(FACTS_FILE) ? readFileSync(FACTS_FILE, "utf8") : "";
    if (current !== json) {
      writeFileSync(FACTS_FILE, json);
      console.log(`build-facts: wrote ${path.relative(cwd, FACTS_FILE)}`);
    } else console.log("build-facts: unchanged");
  }
}

if (import.meta.main) main();
