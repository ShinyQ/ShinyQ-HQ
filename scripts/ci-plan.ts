/**
 * Smart CI planner (owner decisions 2026-10-17 and 2026-10-18, docs/agents/ci-and-deploy.md): which heavy
 * CI work a pull request needs. Typecheck, lint, unit tests, the build (CSP hashes, public-safety scan,
 * og:check) and the secret scan always run. A pull request runs only the affected e2e specs (plus a small
 * smoke set when 3D or page code changed) on as many shards as their measured time needs, only the 3D perf
 * gates its 3D files can move, and only the Lighthouse URLs its files can move. Pushes, dispatches, the
 * nightly schedule, the `full-ci` label and any failure here run everything.
 *
 *   EVENT=pull_request REPO=owner/name PR=123 GH_TOKEN=... bun scripts/ci-plan.ts
 *
 * Writes the planOutputs keys to $GITHUB_OUTPUT and a table to the job summary. Uses fetch and GH_TOKEN
 * only; no dependencies, so the job skips `bun install`.
 */
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { e2eShardsFor, locateTest, MAX_E2E_SHARDS, PR_SMOKE, specSeconds, specsForChanges, type Durations, type DurationsFile, type Spec } from "./e2e-plan";
import { ALL_PERF_KEYS, perfGrep, perfKeysFor, type PerfKey } from "./perf-plan";

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
// Assumes semicolon-terminated statements (the codebase style): `[^;]*?` stops a static import at its `;`.
const IMPORT = /(?:import|export)\s+(?!type\s)[^;]*?\sfrom\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
/** `@import "x.css"` and `@import url(x.css)` in stylesheets; bare package names (tailwindcss) do not resolve. */
const CSS_IMPORT = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?/g;
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".mjs", ".json", "/index.ts", "/index.tsx"];

function resolveImport(from: string, spec: string, read: (f: string) => string | null): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) base = path.posix.join(path.posix.dirname(from), spec);
  else return null;
  for (const ext of EXTENSIONS) if (read(base + ext) !== null) return base + ext;
  return null;
}

/**
 * Every repo file reachable from `roots` through value, re-export, side-effect and dynamic imports, and
 * relative CSS `@import` (`dynamic: false` skips `import()`, for what a page loads before any lazy chunk).
 */
export function importClosure(roots: readonly string[], read: (f: string) => string | null, options: { dynamic?: boolean } = {}): Set<string> {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const source = read(file);
    if (source === null) continue;
    seen.add(file);
    if (file.endsWith(".css")) {
      for (const m of source.matchAll(CSS_IMPORT)) {
        const target = resolveImport(file, m[1], read);
        if (target && !seen.has(target)) queue.push(target);
      }
      continue;
    }
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;
    for (const m of source.matchAll(IMPORT)) {
      if (m[2] !== undefined && options.dynamic === false) continue;
      const target = resolveImport(file, m[1] ?? m[2] ?? m[3], read);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

export interface PlanOptions {
  /** Default "pull_request" when `files` is known, "other" when it is null. */
  event?: "pull_request" | "other";
  /** The e2e lane of e2e/durations.json, for the shard count. */
  durations?: Durations | null;
  /** Line of a smoke test in e2e/<spec>.spec.ts (default: read the file from the working directory). */
  locate?: (spec: Spec, title: string) => number | null;
  /** Lighthouse URL paths a file can move ([] = none). Default: page and 3D code "all", content none. */
  pages?: (file: string) => readonly string[] | "all";
  /** The pull request carries the `full-ci` label. */
  fullLabel?: boolean;
}

export interface CiPlan {
  /** A forced full run (push, label, CI or unclassified changes); planOutputs also reports full when every heavy job runs. */
  full: boolean;
  e2e: "all" | Spec[];
  /** Extra `e2e/<spec>.spec.ts:<line>` filters (smoke tests), only with a spec list. */
  e2eTests: string[];
  /** 1 to 8; 8 for "all". */
  e2eShards: number;
  /** false: no perf; ALL_PERF_KEYS: the whole lane. */
  perf: false | PerfKey[];
  /** 2 on pull requests, 4 otherwise. */
  perfShards: number;
  /** URL paths such as "/en/quick". */
  lighthouse: false | "all" | string[];
  classes: Partial<Record<ChangeClass, string[]>>;
  reasons: string[];
}

/** Lighthouse URL path to the page file that renders it (the measured URLs of lighthouserc.json, in its order). */
export const LIGHTHOUSE_PAGES: Readonly<Record<string, string>> = {
  "/en": "src/app/[locale]/page.tsx",
  "/id": "src/app/[locale]/page.tsx",
  "/en/quick": "src/app/[locale]/quick/page.tsx",
  "/en/journey": "src/app/[locale]/journey/page.tsx",
  "/en/labs/voice-ai-contact-center": "src/app/[locale]/labs/[slug]/page.tsx",
  "/en/blog/making-a-voice-agent-interruptible": "src/app/[locale]/blog/[slug]/page.tsx",
  "/en/contact": "src/app/[locale]/contact/page.tsx",
  "/en/cv": "src/app/[locale]/cv/page.tsx",
  "/en/build": "src/app/[locale]/build/page.tsx",
};

const SPEC_FILE = /^e2e\/[^/]+\.spec\.ts$/;

const defaultPages = (file: string): readonly string[] | "all" => (["ui", "code3d"].includes(classify(file)) ? "all" : []);

/** Reads e2e/<spec>.spec.ts under `root` and finds the test by its title. */
export function locateFromDisk(root: string): (spec: Spec, title: string) => number | null {
  return (spec, title) => {
    const p = path.join(root, "e2e", `${spec}.spec.ts`);
    return existsSync(p) ? locateTest(readFileSync(p, "utf8"), title) : null;
  };
}

function classesOf(files: readonly string[]): Partial<Record<ChangeClass, string[]>> {
  const classes: Partial<Record<ChangeClass, string[]>> = {};
  for (const file of files) (classes[classify(file)] ??= []).push(file);
  return classes;
}

/**
 * `files` null means unknown (push, dispatch, schedule, or the PR file list failed): run everything.
 * `in3d` tells whether the 3D roots import a file (shared page code that can move the perf gates).
 */
export function planFor(files: readonly string[] | null, in3d: (file: string) => boolean, opts: PlanOptions = {}): CiPlan {
  const event = opts.event ?? (files === null ? "other" : "pull_request");
  const perfShards = event === "pull_request" ? 2 : 4;
  const full = (classes: CiPlan["classes"], reasons: string[]): CiPlan => ({
    full: true,
    e2e: "all",
    e2eTests: [],
    e2eShards: MAX_E2E_SHARDS,
    perf: [...ALL_PERF_KEYS],
    perfShards,
    lighthouse: "all",
    classes,
    reasons,
  });
  if (files === null) return full({}, ["not a pull request, or the changed files are unknown: full run"]);
  const classes = classesOf(files);
  if (event !== "pull_request") return full(classes, ["not a pull request: full run"]);
  if (opts.fullLabel) return full(classes, ["the pull request has the full-ci label: full run"]);
  if (classes.ci || classes.other) {
    return full(classes, [`${classes.ci ? "CI, dependency or test infrastructure" : "unclassified"} files changed: full run`]);
  }
  const reasons: string[] = [];

  // e2e: the mapped specs of every non-docs, non-tests file; an unmapped path is a full run, a changed helper every e2e shard.
  let e2e: "all" | Spec[];
  const e2eTests: string[] = [];
  const helpers = (classes.e2e ?? []).filter((f) => !SPEC_FILE.test(f));
  // Helpers have no rule of their own (any spec may import them): they are handled below, not as unmapped.
  const mapped = specsForChanges(files.filter((f) => !["docs", "tests"].includes(classify(f)) && !helpers.includes(f)));
  if (mapped.unmatched.length) return full(classes, [`no e2e rule covers ${mapped.unmatched.join(", ")}: full run`]);
  if (helpers.length) {
    e2e = "all";
    reasons.push(`e2e helpers changed: ${helpers.join(", ")} (every e2e shard)`);
  } else if (mapped.specs === "all") {
    e2e = "all";
    reasons.push("the e2e mapping asks for the full suite");
  } else {
    const specs = new Set<Spec>(mapped.specs);
    if (classes.code3d || classes.ui) {
      const locate = opts.locate ?? locateFromDisk(process.cwd());
      for (const { spec } of PR_SMOKE.filter((s) => s.title === undefined)) specs.add(spec);
      for (const { spec, title } of PR_SMOKE) {
        if (title === undefined || specs.has(spec)) continue;
        const at = locate(spec, title);
        if (at === null) reasons.push(`smoke test not found, skipped: ${spec}: ${title}`);
        else e2eTests.push(`e2e/${spec}.spec.ts:${at}`);
      }
    }
    e2e = [...specs].sort();
    reasons.push(e2e.length ? `e2e specs: ${e2e.join(", ")}${e2eTests.length ? `; smoke tests: ${e2eTests.join(", ")}` : ""}` : "no e2e specs cover these changes");
  }
  let e2eShards = MAX_E2E_SHARDS;
  if (e2e !== "all") {
    const titled = new Map(PR_SMOKE.filter((s) => s.title !== undefined).map((s) => [s.spec, s.title!]));
    const seconds =
      e2e.reduce((sum, spec) => sum + specSeconds(opts.durations, spec), 0) +
      e2eTests.reduce((sum, t) => {
        const spec = /^e2e\/(.+)\.spec\.ts:/.exec(t)![1] as Spec;
        return sum + specSeconds(opts.durations, spec, titled.get(spec));
      }, 0);
    e2eShards = e2eShardsFor(seconds);
    if (seconds) reasons.push(`about ${Math.round(seconds)} worker-seconds of e2e: ${e2eShards} shard${e2eShards > 1 ? "s" : ""}`);
  }

  // Perf: the 3D files, plus page code the 3D roots import.
  const shared3d = (classes.ui ?? []).filter((f) => f.startsWith("src/") && in3d(f));
  if (shared3d.length) reasons.push(`imported by the 3D roots: ${shared3d.join(", ")} (perf gates)`);
  const keys = perfKeysFor([...(classes.code3d ?? []), ...shared3d]);
  const perf = keys.length ? keys : false;
  if (perf) reasons.push(perf.length === ALL_PERF_KEYS.length ? "3D perf gates: the whole lane" : `3D perf gates: ${perf.join(", ")}`);

  // Lighthouse: the URLs that page, 3D and content files can move.
  const pages = opts.pages ?? defaultPages;
  const order = Object.keys(LIGHTHOUSE_PAGES);
  const paths = new Set<string>();
  let lighthouse: CiPlan["lighthouse"] = false;
  for (const file of [...(classes.code3d ?? []), ...(classes.ui ?? []), ...(classes.content ?? [])]) {
    const moved = pages(file);
    if (moved === "all") {
      lighthouse = "all";
      break;
    }
    for (const p of moved) paths.add(p);
  }
  if (lighthouse !== "all" && paths.size) {
    const rank = (p: string) => (order.includes(p) ? order.indexOf(p) : order.length);
    lighthouse = [...paths].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }
  if (lighthouse) reasons.push(lighthouse === "all" ? "Lighthouse: every URL" : `Lighthouse: ${lighthouse.join(", ")}`);

  return { full: false, e2e, e2eTests, e2eShards, perf, perfShards, lighthouse, classes, reasons };
}

const range = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => i + 1));

/**
 * The $GITHUB_OUTPUT values. `lhciUrls` is the full `ci.collect.url` list of lighthouserc.json; a Lighthouse
 * path list becomes its warm-up URL plus the selected URLs, and `""` (every URL) when "all" or a path is missing.
 */
export function planOutputs(plan: CiPlan, lhciUrls: readonly string[] = []): Record<string, string> {
  const specs = plan.e2e === "all" ? [] : plan.e2e;
  const tests = plan.e2e === "all" ? [] : plan.e2eTests;
  const perfAll = plan.perf !== false && ALL_PERF_KEYS.every((k) => (plan.perf as PerfKey[]).includes(k));
  let lighthouseUrls = "";
  if (Array.isArray(plan.lighthouse)) {
    const pathOf = (u: string) => {
      try {
        const url = new URL(u);
        return url.search ? null : url.pathname;
      } catch {
        return null;
      }
    };
    const warmup = lhciUrls.find((u) => u.includes("lhci-warmup"));
    const wanted = new Set(plan.lighthouse);
    const picked = lhciUrls.filter((u) => wanted.has(pathOf(u) ?? ""));
    const found = new Set(picked.map(pathOf));
    if (warmup && plan.lighthouse.every((p) => found.has(p))) lighthouseUrls = JSON.stringify([warmup, ...picked]);
  }
  return {
    full: String(plan.full || (plan.e2e === "all" && perfAll && plan.lighthouse === "all")),
    e2e: plan.e2e === "all" ? "all" : specs.length || tests.length ? "specs" : "none",
    e2e_files: [...specs.map((s) => `e2e/${s}.spec.ts`).sort(), ...tests].join(" "),
    e2e_shards: range(plan.e2eShards),
    e2e_total: String(plan.e2eShards),
    perf: String(plan.perf !== false && plan.perf.length > 0),
    perf_grep: plan.perf ? perfGrep(plan.perf) : "",
    perf_shards: range(plan.perfShards),
    perf_total: String(plan.perfShards),
    lighthouse: String(plan.lighthouse !== false),
    lighthouse_urls: lighthouseUrls,
  };
}

/** Layouts: anything they import statically moves every Lighthouse URL. */
const LAYOUTS = ["src/app/[locale]/layout.tsx", "src/app/(root)/layout.tsx"];
const BLOG_URL = Object.keys(LIGHTHOUSE_PAGES).find((p) => p.startsWith("/en/blog/"))!;
const BUILD_URL = "/en/build";

/**
 * The Lighthouse URL paths a file can move. Strings, fonts, the build steps, the dataset and the generated
 * facts move every URL; the build facts only /en/build and the posts only the measured post. Any other file
 * moves every URL when the layouts import it statically, else the measured pages whose static imports reach it.
 */
export function pagesFromRepo(read: (f: string) => string | null): (file: string) => readonly string[] | "all" {
  const layouts = importClosure(LAYOUTS, read, { dynamic: false });
  const pageClosures = Object.entries(LIGHTHOUSE_PAGES).map(([url, file]) => [url, importClosure([file], read, { dynamic: false })] as const);
  return (file) => {
    if (file === "content/generated/build-facts.json") return [BUILD_URL];
    if (/^content\/(blog|posts)\//.test(file)) return [BLOG_URL];
    // src/i18n/request.ts is loaded by createNextIntlPlugin in next.config.ts, not through an import.
    if (/^src\/i18n\/request\.ts$|^messages\/|^public\/(fonts|brand)\/|^src\/assets\/fonts\/[^/]+\.woff2$|^content\/(site-content\.json$|generated\/)/.test(file)) return "all";
    if (classify(file) === "ui" && file.startsWith("scripts/")) return "all";
    if (layouts.has(file)) return "all";
    return pageClosures.filter(([, closure]) => closure.has(file)).map(([url]) => url);
  };
}

/** GitHub caps the PR files API at 3000 files; at the cap the list may be cut, so plan a full run. */
const MAX_FILES = 3000;

function apiHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
}

async function prFiles(repo: string, pr: string, token: string): Promise<string[] | null> {
  const files: string[] = [];
  for (let page = 1; page <= MAX_FILES / 100; page++) {
    const response = await fetch(`https://api.github.com/repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`, {
      headers: apiHeaders(token),
      // A hung API call falls back to a full run (main's catch) instead of hitting the job timeout.
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`GitHub API pulls/${pr}/files: HTTP ${response.status}`);
    const batch = (await response.json()) as { filename: string; previous_filename?: string }[];
    for (const f of batch) files.push(f.filename, ...(f.previous_filename ? [f.previous_filename] : []));
    if (batch.length < 100) return files;
  }
  return null;
}

/** True when the pull request carries the `full-ci` label; any API error means no label. */
async function hasFullLabel(repo: string, pr: string, token: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/issues/${pr}/labels?per_page=100`, { headers: apiHeaders(token), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return false;
    const labels = (await response.json()) as { name: string }[];
    return labels.some((l) => l.name === "full-ci");
  } catch {
    return false;
  }
}

function repoReader(root: string): (f: string) => string | null {
  return (f) => {
    const p = path.join(root, f);
    return existsSync(p) && statSync(p).isFile() ? readFileSync(p, "utf8") : null;
  };
}

function listRoots(root: string): string[] {
  const out = Bun.spawnSync(["git", "ls-files", "src/experience", "src/hud", "src/store"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  // spawnSync does not throw on a non-zero exit; throw so main().catch plans a full run instead of perf: false.
  if (out.exitCode !== 0) throw new Error(`git ls-files exited ${out.exitCode}: ${out.stderr.toString().trim()}`);
  const roots = out.stdout.toString().split("\n").filter((f) => ROOTS.test(f));
  if (roots.length === 0) throw new Error("git ls-files listed no 3D roots");
  return roots;
}

function readJson<T>(read: (f: string) => string | null, file: string): T | null {
  const text = read(file);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function lhciUrlsFrom(read: (f: string) => string | null): string[] {
  return readJson<{ ci?: { collect?: { url?: string[] } } }>(read, "lighthouserc.json")?.ci?.collect?.url ?? [];
}

function writeOutputs(outputs: Record<string, string>) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`).join(""));
}

async function main() {
  const { EVENT, REPO, PR, GH_TOKEN } = process.env;
  const event = EVENT === "pull_request" ? "pull_request" : "other";
  let files: string[] | null = null;
  let fullLabel = false;
  let note = "";
  if (event === "pull_request" && REPO && PR && GH_TOKEN) {
    try {
      files = await prFiles(REPO, PR, GH_TOKEN);
      if (files === null) note = `more than ${MAX_FILES} files`;
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
      console.log(`::warning::Smart CI could not list the PR files (${note}); running everything.`);
    }
    if (files) fullLabel = await hasFullLabel(REPO, PR, GH_TOKEN);
  }
  const root = process.cwd();
  const read = repoReader(root);
  const closure = files ? importClosure(listRoots(root), read) : new Set<string>();
  const plan = planFor(files, (f) => closure.has(f), {
    event,
    fullLabel,
    durations: readJson<DurationsFile>(read, "e2e/durations.json")?.e2e ?? null,
    locate: locateFromDisk(root),
    pages: files ? pagesFromRepo(read) : undefined,
  });
  if (note) plan.reasons.unshift(`full run: ${note}`);
  const outputs = planOutputs(plan, lhciUrlsFrom(read));
  console.log(JSON.stringify({ outputs, reasons: plan.reasons, classes: plan.classes }, null, 2));
  writeOutputs(outputs);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = Object.entries(plan.classes).map(([cls, list]) => `| \`${cls}\` | ${list!.length} | ${list!.slice(0, 5).map((f) => `\`${f}\``).join(", ")}${list!.length > 5 ? ", ..." : ""} |`);
    const summary = [
      `### Smart CI plan: ${outputs.full === "true" ? "full run" : "selective run"}`,
      "",
      `e2e: **${outputs.e2e}** on ${outputs.e2e_total} shard(s)${outputs.e2e_files ? ` (${outputs.e2e_files})` : ""}`,
      `3D perf gates: **${outputs.perf}**${outputs.perf === "true" ? ` on ${outputs.perf_total} shard(s)${outputs.perf_grep ? `, grep \`${outputs.perf_grep}\`` : ", the whole lane"}` : ""}`,
      `Lighthouse: **${outputs.lighthouse}**${outputs.lighthouse === "true" ? (Array.isArray(plan.lighthouse) && outputs.lighthouse_urls ? ` (${plan.lighthouse.join(", ")})` : ", every URL") : ""}`,
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
    writeOutputs(planOutputs(planFor(null, () => false, { event: process.env.EVENT === "pull_request" ? "pull_request" : "other" })));
  });
}
