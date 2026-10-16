/**
 * Smart CI planner (owner decision 2026-10-17, docs/agents/ci-and-deploy.md): which heavy CI jobs a
 * pull request needs. Typecheck, lint, unit tests, the build (CSP hashes, public-safety scan, og:check)
 * and the secret scan always run; e2e, the 3D perf gates and Lighthouse run only for the classes below.
 * Pushes, dispatches and the nightly schedule are always full, and so is any failure here.
 *
 *   EVENT=pull_request REPO=owner/name PR=123 GH_TOKEN=... bun scripts/ci-plan.ts
 *
 * Writes full, e2e (all | specs | none), e2e_files, perf and lighthouse to $GITHUB_OUTPUT and a table
 * to the job summary. Uses fetch and GH_TOKEN only; no dependencies, so the job skips `bun install`.
 */
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { specsForChanges, type Spec } from "./e2e-plan";

export type ChangeClass = "ci" | "code3d" | "ui" | "functions" | "e2e" | "tooling" | "content" | "docs" | "tests" | "other";

/** First match wins. Keep in sync with the class table in docs/agents/ci-and-deploy.md. */
const CLASSES: [RegExp, ChangeClass][] = [
  [/^\.github\/(workflows|actions)\/|^(package\.json|bun\.lock|bunfig\.toml|next\.config\.ts|playwright\.config\.ts|tsconfig\.json|lighthouserc\.json)$|^postcss\.config\.\w+$|^e2e\/(hq|routes|budgets)\.ts$|^e2e\/perf\/|^scripts\/(ci-plan|e2e-plan|e2e-shard|perf-[\w-]+|serve-static|flaky-report)\.(ts|sh)$/, "ci"],
  [/^src\/(experience|hud|store|assets)\/|^public\/(floors|fonts)\//, "code3d"],
  [/^tests\/|^e2e\/durations\.json$|^(vitest\.config\.mts|eslint\.config\.mjs)$/, "tests"],
  [/^e2e\//, "e2e"],
  [/^content\/|^public\/(media|papers|cv)\//, "content"],
  [/^functions\/|^workers\/|^wrangler\.toml$/, "functions"],
  [/^scripts\/(build-knowledge|defer-scripts|root-redirect|check-client-chunks|csp-hashes|csp-policy)\.ts$/, "ui"],
  [/^scripts\//, "tooling"],
  [/^src\/|^messages\/|^public\//, "ui"],
  [/^docs\/|^\.github\/|\.md$|^LICENSE$|^\.[\w.-]+$/, "docs"],
];

export function classify(file: string): ChangeClass {
  return CLASSES.find(([re]) => re.test(file))?.[1] ?? "other";
}

/** Roots of the 3D experience: anything they import (value imports) is 3D code for the perf gates. */
export const ROOTS = /^src\/(experience|hud|store)\/.+\.(ts|tsx)$/;
const IMPORT = /(?:import|export)\s+(?!type\s)[^;]*?\sfrom\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".mjs", ".json", "/index.ts", "/index.tsx"];

function resolveImport(from: string, spec: string, read: (f: string) => string | null): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) base = path.posix.join(path.posix.dirname(from), spec);
  else return null;
  for (const ext of EXTENSIONS) if (read(base + ext) !== null) return base + ext;
  return null;
}

/** Every repo file reachable from `roots` through value, re-export, side-effect and dynamic imports. */
export function importClosure(roots: readonly string[], read: (f: string) => string | null): Set<string> {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const source = read(file);
    if (source === null) continue;
    seen.add(file);
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;
    for (const m of source.matchAll(IMPORT)) {
      const target = resolveImport(file, m[1] ?? m[2] ?? m[3], read);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

export interface CiPlan {
  /** A forced full run (unknown files, CI or unclassified changes); planOutputs also reports full when every heavy job runs. */
  full: boolean;
  e2e: "all" | Spec[];
  perf: boolean;
  lighthouse: boolean;
  classes: Partial<Record<ChangeClass, string[]>>;
  reasons: string[];
}

const FULL: Omit<CiPlan, "classes" | "reasons"> = { full: true, e2e: "all", perf: true, lighthouse: true };
const NARROW: ReadonlySet<ChangeClass> = new Set(["ui", "functions", "e2e", "tooling"]);

/** `files` null means unknown (push, dispatch, schedule, or the PR file list failed): run everything. */
export function planFor(files: readonly string[] | null, in3d: (file: string) => boolean): CiPlan {
  if (files === null) return { ...FULL, classes: {}, reasons: ["not a pull request, or the changed files are unknown: full run"] };
  const classes: Partial<Record<ChangeClass, string[]>> = {};
  for (const file of files) (classes[classify(file)] ??= []).push(file);
  const reasons: string[] = [];
  if (classes.ci || classes.other) {
    reasons.push(`${classes.ci ? "CI, dependency or test infrastructure" : "unclassified"} files changed: full run`);
    return { ...FULL, classes, reasons };
  }
  const shared3d = (classes.ui ?? []).filter((f) => f.startsWith("src/") && in3d(f));
  const perf = Boolean(classes.code3d) || shared3d.length > 0;
  const lighthouse = Boolean(classes.code3d || classes.ui);
  let e2e: "all" | Spec[] = [];
  if (classes.code3d) {
    e2e = "all";
    reasons.push("3D code changed: every e2e shard, the perf gates and Lighthouse");
  } else {
    const narrow = files.filter((f) => NARROW.has(classify(f)));
    const mapped = narrow.length ? specsForChanges(narrow).specs : [];
    e2e = mapped;
    if (shared3d.length) reasons.push(`imported by the 3D roots: ${shared3d.join(", ")} (perf gates)`);
    if (lighthouse) reasons.push("page code, strings or assets changed: Lighthouse");
    reasons.push(e2e === "all" ? "the e2e mapping asks for the full suite" : e2e.length ? `e2e specs: ${e2e.join(", ")}` : "no e2e specs cover these changes");
  }
  return { full: false, e2e, perf, lighthouse, classes, reasons };
}

export function planOutputs(plan: CiPlan): Record<string, string> {
  const specs = plan.e2e === "all" ? [] : plan.e2e;
  return {
    full: String(plan.full || (plan.e2e === "all" && plan.perf && plan.lighthouse)),
    e2e: plan.e2e === "all" ? "all" : specs.length ? "specs" : "none",
    e2e_files: specs.map((s) => `e2e/${s}.spec.ts`).join(" "),
    perf: String(plan.perf),
    lighthouse: String(plan.lighthouse),
  };
}

/** GitHub caps the PR files API at 3000 files; at the cap the list may be cut, so plan a full run. */
const MAX_FILES = 3000;

async function prFiles(repo: string, pr: string, token: string): Promise<string[] | null> {
  const files: string[] = [];
  for (let page = 1; page <= MAX_FILES / 100; page++) {
    const response = await fetch(`https://api.github.com/repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!response.ok) throw new Error(`GitHub API pulls/${pr}/files: HTTP ${response.status}`);
    const batch = (await response.json()) as { filename: string; previous_filename?: string }[];
    for (const f of batch) files.push(f.filename, ...(f.previous_filename ? [f.previous_filename] : []));
    if (batch.length < 100) return files;
  }
  return null;
}

function repoReader(root: string): (f: string) => string | null {
  return (f) => {
    const p = path.join(root, f);
    return existsSync(p) && statSync(p).isFile() ? readFileSync(p, "utf8") : null;
  };
}

function listRoots(root: string): string[] {
  const out = Bun.spawnSync(["git", "ls-files", "src/experience", "src/hud", "src/store"], { cwd: root, stdout: "pipe" });
  return out.stdout.toString().split("\n").filter((f) => ROOTS.test(f));
}

async function main() {
  const { EVENT, REPO, PR, GH_TOKEN } = process.env;
  let files: string[] | null = null;
  let note = "";
  if (EVENT === "pull_request" && REPO && PR && GH_TOKEN) {
    try {
      files = await prFiles(REPO, PR, GH_TOKEN);
      if (files === null) note = `more than ${MAX_FILES} files`;
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
      console.log(`::warning::Smart CI could not list the PR files (${note}); running everything.`);
    }
  }
  const root = process.cwd();
  const closure = files ? importClosure(listRoots(root), repoReader(root)) : new Set<string>();
  const plan = planFor(files, (f) => closure.has(f));
  if (note) plan.reasons.unshift(`full run: ${note}`);
  const outputs = planOutputs(plan);
  console.log(JSON.stringify({ outputs, reasons: plan.reasons, classes: plan.classes }, null, 2));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`).join(""));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = Object.entries(plan.classes).map(([cls, list]) => `| \`${cls}\` | ${list!.length} | ${list!.slice(0, 5).map((f) => `\`${f}\``).join(", ")}${list!.length > 5 ? ", ..." : ""} |`);
    const summary = [
      `### Smart CI plan: ${outputs.full === "true" ? "full run" : "selective run"}`,
      "",
      `e2e: **${outputs.e2e}**${outputs.e2e_files ? ` (${outputs.e2e_files})` : ""}, 3D perf gates: **${outputs.perf}**, Lighthouse: **${outputs.lighthouse}**`,
      "",
      ...plan.reasons.map((r) => `- ${r}`),
      ...(rows.length ? ["", "| Class | Files | Examples |", "|---|---|---|", ...rows] : []),
      "",
    ].join("\n");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    // Fail safe: an unexpected error plans a full run instead of blocking the PR.
    console.log(`::warning::Smart CI planner failed (${error instanceof Error ? error.message : String(error)}); running everything.`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(planOutputs(planFor(null, () => false))).map(([k, v]) => `${k}=${v}\n`).join(""));
  });
}
