/**
 * Smart CI planner (owner decisions 2026-10-17 and 2026-10-18, docs/agents/ci-and-deploy.md): which heavy
 * CI work a pull request needs. Typecheck, lint, unit tests, the build (CSP hashes, script policy check,
 * og:check) and the secret scan always run. A pull request runs only the affected e2e specs (plus a small
 * smoke set when 3D or page code changed) on as many shards as their measured time needs, only the 3D perf
 * gates its 3D files can move (also sized from their measured time), and only the Lighthouse URLs its files can
 * move. Every run has at most 10 e2e plus perf shards (HEAVY_SHARDS), so a full one is 6 e2e and 4 perf. A push to main whose merged
 * pull request passed CI on the same tree runs only the complement of that run (scripts/ci-complement.ts).
 * Other pushes, dispatches, the nightly schedule, the `full-ci` label and any failure here run everything.
 *
 *   EVENT=pull_request REPO=owner/name PR=123 GH_TOKEN=... bun scripts/ci-plan.ts
 *   EVENT=push REPO=owner/name SHA=<commit> GH_TOKEN=... bun scripts/ci-plan.ts
 *   EVENT=workflow_dispatch COMPLEMENT_PR=123 REPO=owner/name SHA=<commit> GH_TOKEN=... bun scripts/ci-plan.ts
 *
 * Writes the planOutputs keys to $GITHUB_OUTPUT, a table to the job summary and the run's record to
 * ci-plan.json (the `ci-plan` artifact). Uses fetch, gh and GH_TOKEN only; no dependencies, so the job skips
 * `bun install`.
 */
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { complementPlan, findSource, HEAVY_SHARDS, MAX_PERF_SHARDS, parseRecord, perfSeconds, perfShardsFor, PLAN_ARTIFACT, PLAN_FILE, recordFor, type GreenRun, type Source, type SourceDeps, type SourceResult } from "./ci-complement";
import * as headE2ePlan from "./e2e-plan";
import { ALL_SPECS, e2eShardsFor, locateTest, MAX_E2E_SHARDS, PR_SMOKE, specSeconds, specsForChanges, type Durations, type DurationsFile, type Spec } from "./e2e-plan";
import type { MergedPr } from "./merge-gate";
import * as headPerfPlan from "./perf-plan";
import { ALL_BUT_MEMORY, ALL_PERF_KEYS, nightlyPerfFor, PAYLOAD_BUILDER, pagePerfKeys, perfGrep, perfKeysFor, sharedRuleKeys, type PerfKey } from "./perf-plan";

export { HEAVY_SHARDS };

export type ChangeClass = "planmap" | "ci" | "code3d" | "ui" | "functions" | "e2e" | "tooling" | "content" | "docs" | "tests" | "other";

/**
 * The spec maps (owner decision 2026-11-01): a change runs the specs and perf keys whose mapping it changes
 * (`mapDiff`), not everything.
 */
export const PLAN_MAPS = ["scripts/e2e-plan.ts", "scripts/perf-plan.ts"] as const;

/**
 * First match wins. Keep in sync with the class table in docs/agents/ci-and-deploy.md. Only ci.yml and the setup
 * action of the workflows can change a test result; the other workflows are `docs` (unit tests check them).
 */
const CLASSES: [RegExp, ChangeClass][] = [
  [/^scripts\/(e2e|perf)-plan\.ts$/, "planmap"],
  [/^\.github\/(workflows\/ci\.yml$|actions\/)|^(package\.json|bun\.lock|bunfig\.toml|next\.config\.ts|playwright\.config\.ts|tsconfig\.json|lighthouserc\.json)$|^postcss\.config\.\w+$|^patches\/|^e2e\/(hq|routes|budgets)\.ts$|^e2e\/perf\/|^scripts\/(ci-plan|ci-complement|ci-status|merge-gate|e2e-shard|perf-[\w-]+|serve-static|flaky-report)\.(ts|sh)$/, "ci"],
  [/^src\/(experience|hud|store|assets)\/|^public\/(floors|fonts|atlas)\//, "code3d"],
  [/^tests\/|^e2e\/durations\.json$|^(vitest\.config\.mts|eslint\.config\.mjs)$/, "tests"],
  [/^e2e\//, "e2e"],
  [/^content\/|^public\/(media|papers|cv)\//, "content"],
  [/^functions\/|^workers\/|^wrangler\.toml$/, "functions"],
  [/^scripts\/(build-knowledge|defer-scripts|root-redirect|check-client-chunks|csp-hashes|csp-policy)\.ts$/, "ui"],
  [/^scripts\/|^tools\//, "tooling"],
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
export function importClosure(
  roots: readonly string[],
  read: (f: string) => string | null,
  options: { dynamic?: boolean; onEdge?: (from: string, to: string) => void } = {},
): Set<string> {
  const seen = new Set<string>();
  const queue = [...roots];
  const follow = (from: string, target: string | null) => {
    if (!target) return;
    options.onEdge?.(from, target);
    if (!seen.has(target)) queue.push(target);
  };
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const source = read(file);
    if (source === null) continue;
    seen.add(file);
    if (file.endsWith(".css")) {
      for (const m of source.matchAll(CSS_IMPORT)) follow(file, resolveImport(file, m[1], read));
      continue;
    }
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;
    for (const m of source.matchAll(IMPORT)) {
      if (m[2] !== undefined && options.dynamic === false) continue;
      follow(file, resolveImport(file, m[1] ?? m[2] ?? m[3], read));
    }
  }
  return seen;
}

/** Reverse import edges of the closure of `roots`: each reached file to the closure files that import it. */
export function reverseImports(roots: readonly string[], read: (f: string) => string | null): Map<string, Set<string>> {
  const importers = new Map<string, Set<string>>();
  importClosure(roots, read, { onEdge: (from, to) => (importers.get(to) ?? importers.set(to, new Set()).get(to)!).add(from) });
  return importers;
}

/**
 * The 3D files (ROOTS) that import `file` directly or through a chain of non-3D files; the walk stops at each
 * 3D file, so a module the Lobby imports reaches the Lobby, not everything that imports the Lobby.
 */
export function importing3d(file: string, importers: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  const found = new Set<string>();
  const seen = new Set([file]);
  const queue = [file];
  while (queue.length) {
    for (const from of importers.get(queue.pop()!) ?? []) {
      if (seen.has(from)) continue;
      seen.add(from);
      if (ROOTS.test(from)) found.add(from);
      else queue.push(from);
    }
  }
  return [...found].sort();
}

/**
 * The perf keys of a shared (non-3D) file: the keys an edit of the 3D files importing it would get (unknown 3D
 * files: ALL_BUT_MEMORY), plus its SHARED_PERF_RULES keys. The payload builder counts through the rule, and as
 * ALL_BUT_MEMORY without one. A file no 3D file imports gets none.
 */
export function sharedPerfKeys(file: string, importers: ReadonlyMap<string, ReadonlySet<string>>): PerfKey[] {
  const via = importing3d(file, importers);
  if (via.length === 0) return [];
  const client = via.filter((f) => f !== PAYLOAD_BUILDER);
  const own = sharedRuleKeys(file) ?? (client.length < via.length ? ALL_BUT_MEMORY : []);
  const keys = new Set<PerfKey>([...perfKeysFor(client), ...own]);
  return ALL_PERF_KEYS.filter((k) => keys.has(k));
}

/** The parts of scripts/e2e-plan.ts and scripts/perf-plan.ts that decide what a path runs (`mapDiff`). */
export interface PlanMaps {
  e2e: {
    specsForChanges(files: readonly string[]): { specs: readonly string[] | "all" };
    PR_SMOKE?: readonly { spec: string; title?: string }[];
    SMOKE_SPECS?: readonly string[];
  };
  perf: {
    perfKeysFor(files: readonly string[]): readonly string[];
    sharedRuleKeys?(file: string): readonly string[] | null;
    pagePerfKeys?(file: string): readonly string[];
    perfGrep?(keys: readonly string[]): string;
  };
}

/** The head spec maps: the versions Plan CI checked out. */
export const HEAD_MAPS: PlanMaps = { e2e: headE2ePlan, perf: headPerfPlan };

/**
 * What a change of the spec maps moves: over every tracked file, the e2e specs and perf keys the base and the head
 * maps disagree on (both directions), the specs whose smoke entries changed and the perf keys whose test selection
 * changed. A file that one side sends to the full suite and the other does not makes the e2e side "all".
 */
export function mapDiff(base: PlanMaps, head: PlanMaps, tracked: readonly string[]): MapDiff {
  const specs = new Set<string>();
  const keys = new Set<string>();
  let allSpecs = false;
  const both = (a: readonly string[], b: readonly string[], into: Set<string>) => {
    for (const x of a) if (!b.includes(x)) into.add(x);
    for (const x of b) if (!a.includes(x)) into.add(x);
  };
  for (const file of tracked) {
    const cls = classify(file);
    if (cls === "docs" || cls === "tests") continue;
    const b = base.e2e.specsForChanges([file]).specs;
    const h = head.e2e.specsForChanges([file]).specs;
    if (b === "all" || h === "all") allSpecs ||= b !== h;
    else both(b, h, specs);
    if (cls === "code3d") both(base.perf.perfKeysFor([file]), head.perf.perfKeysFor([file]), keys);
    if (cls === "ui" && file.startsWith("src/")) {
      both(base.perf.sharedRuleKeys?.(file) ?? [], head.perf.sharedRuleKeys?.(file) ?? [], keys);
      both(base.perf.pagePerfKeys?.(file) ?? [], head.perf.pagePerfKeys?.(file) ?? [], keys);
    }
  }
  const smoke = (m: PlanMaps, spec: string) => JSON.stringify((m.e2e.PR_SMOKE ?? []).filter((s) => s.spec === spec));
  for (const spec of ALL_SPECS) if (smoke(base, spec) !== smoke(head, spec)) specs.add(spec);
  both(base.e2e.SMOKE_SPECS ?? [], head.e2e.SMOKE_SPECS ?? [], specs);
  const grep = (m: PlanMaps, k: PerfKey) => {
    try {
      return m.perf.perfGrep?.([k]) ?? null;
    } catch {
      return null;
    }
  };
  for (const k of ALL_PERF_KEYS) if (grep(base, k) !== grep(head, k)) keys.add(k);
  return {
    specs: allSpecs ? "all" : ALL_SPECS.filter((s) => specs.has(s)),
    keys: ALL_PERF_KEYS.filter((k) => keys.has(k)),
  };
}

export interface PlanOptions {
  /** Default "pull_request" when `files` is known, "other" when it is null. */
  event?: "pull_request" | "other";
  /** The e2e lane of e2e/durations.json, for the shard count. */
  durations?: Durations | null;
  /** The perf lane of e2e/durations.json, for the perf shard count of a selective pull request. */
  perfDurations?: Durations | null;
  /** Line of a smoke test in e2e/<spec>.spec.ts (default: read the file from the working directory). */
  locate?: (spec: Spec, title: string) => number | null;
  /** Lighthouse URL paths a file can move ([] = none). Default: page and 3D code "all", content none. */
  pages?: (file: string) => readonly string[] | "all";
  /** The pull request carries the `full-ci` label. */
  fullLabel?: boolean;
  /** What a change of the spec maps (PLAN_MAPS) moves (`mapDiff`); null or missing plans a full run for such a change. */
  mapDiff?: MapDiff | null;
}

/** The specs and perf keys whose mapping differs between the base and the head spec maps. */
export interface MapDiff {
  specs: Spec[] | "all";
  keys: PerfKey[];
}

export interface CiPlan {
  /** A forced full run (push, label, CI or unclassified changes); planOutputs also reports full when every heavy job runs. */
  full: boolean;
  e2e: "all" | Spec[];
  /** Extra `e2e/<spec>.spec.ts:<line>` filters (smoke tests), only with a spec list. */
  e2eTests: string[];
  /** 1 to 8, at most HEAVY_SHARDS minus the perf shards; a full run is 6 (beside the 4 perf shards). */
  e2eShards: number;
  /** false: no perf; ALL_PERF_KEYS: the whole lane. */
  perf: false | PerfKey[];
  /** 1 to 4: the whole lane 4, a pull request's part sized from its durations (perfShardsFor), 1 without perf. */
  perfShards: number;
  /** Also run the nightly-only perf tests (`@nightly`): a pull request that changes the Lobby or the office. */
  perfNightly?: boolean;
  /** URL paths such as "/en/quick". */
  lighthouse: false | "all" | string[];
  classes: Partial<Record<ChangeClass, string[]>>;
  reasons: string[];
  /** A complement run: the green PR run on the same tree that covered the rest. */
  source?: Source;
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

/**
 * Lighthouse splits its URLs over 2 shards (each its own runner, so no parallel Chrome skews a timing) from 4 URLs, in a
 * run with at most 8 e2e plus perf shards: there it finishes last, while a full run's e2e and perf shards outlast it, so
 * a full run keeps one Lighthouse job and its peak of 12 jobs.
 */
export const LIGHTHOUSE_SPLIT_AT = 4;
export const MAX_LIGHTHOUSE_SHARDS = 2;

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
 * `perf3d` gives the perf keys of a shared `src/` file the 3D roots import (`sharedPerfKeys`; [] when none).
 */
export function planFor(files: readonly string[] | null, perf3d: (file: string) => readonly PerfKey[], opts: PlanOptions = {}): CiPlan {
  const event = opts.event ?? (files === null ? "other" : "pull_request");
  const full = (classes: CiPlan["classes"], reasons: string[]): CiPlan => ({
    full: true,
    e2e: "all",
    e2eTests: [],
    e2eShards: HEAVY_SHARDS - MAX_PERF_SHARDS,
    perf: [...ALL_PERF_KEYS],
    perfShards: MAX_PERF_SHARDS,
    perfNightly: files !== null && nightlyPerfFor(files),
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
  if (classes.planmap && !opts.mapDiff) return full(classes, ["the spec maps changed and what they move is unknown: full run"]);
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
  } else if (classes.planmap && opts.mapDiff?.specs === "all") {
    e2e = "all";
    reasons.push("the spec map change moves a path to the full suite");
  } else {
    const specs = new Set<Spec>([...mapped.specs, ...(classes.planmap ? (opts.mapDiff!.specs as Spec[]) : [])]);
    if (classes.planmap) reasons.push(`spec map change: ${opts.mapDiff!.specs.length ? `e2e specs ${(opts.mapDiff!.specs as Spec[]).join(", ")}` : "no e2e spec moves"}`);
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

  // Perf: the 3D files, plus the keys of the 3D files that import shared page code.
  const keySet = new Set<PerfKey>(perfKeysFor(classes.code3d ?? []));
  for (const f of (classes.ui ?? []).filter((f) => f.startsWith("src/"))) {
    const shared = perf3d(f);
    if (shared.length === 0) continue;
    reasons.push(`imported by the 3D roots: ${f} (${shared.length === ALL_PERF_KEYS.length ? "every perf key" : shared.join(", ")})`);
    for (const k of shared) keySet.add(k);
  }
  // Page code with a perf gate of its own (the study guide reader's chunk and worker caps).
  for (const f of classes.ui ?? []) {
    const own = pagePerfKeys(f);
    if (own.length === 0) continue;
    reasons.push(`perf gate of page code: ${f} (${own.join(", ")})`);
    for (const k of own) keySet.add(k);
  }
  if (classes.planmap && opts.mapDiff!.keys.length) {
    reasons.push(`spec map change: perf keys ${opts.mapDiff!.keys.join(", ")}`);
    for (const k of opts.mapDiff!.keys) keySet.add(k);
  }
  const keys = ALL_PERF_KEYS.filter((k) => keySet.has(k));
  const perf = keys.length ? keys : false;
  // The nightly-only L1 poses (`@nightly`) run on a pull request that changes the Lobby or the office.
  const perfNightly = perf !== false && perf.includes("floor:L1") && nightlyPerfFor(files);
  if (perfNightly) reasons.push("the Lobby or the office changed: the nightly-only L1 perf poses run too");
  // As a complement run: the whole lane on 4 shards, a part on ceil(seconds / 960), 1 to 4; without perf 1 shard ("Not needed").
  const perfShards = !perf ? 1 : perf.length === ALL_PERF_KEYS.length ? MAX_PERF_SHARDS : perfShardsFor(perfSeconds(opts.perfDurations, perf, perfNightly));
  if (perf) reasons.push(`${perf.length === ALL_PERF_KEYS.length ? "3D perf gates: the whole lane" : `3D perf gates: ${perf.join(", ")}`} on ${perfShards} shard${perfShards > 1 ? "s" : ""}`);
  if (e2eShards > HEAVY_SHARDS - perfShards) {
    e2eShards = HEAVY_SHARDS - perfShards;
    reasons.push(`e2e on ${e2eShards} shards beside ${perfShards} perf shards (at most ${HEAVY_SHARDS} per run)`);
  }

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
    // Every selective run also measures the home page.
    paths.add(HOME_URL);
    const rank = (p: string) => (order.includes(p) ? order.indexOf(p) : order.length);
    lighthouse = [...paths].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }
  if (lighthouse) reasons.push(lighthouse === "all" ? "Lighthouse: every URL" : `Lighthouse: ${lighthouse.join(", ")}`);

  return { full: false, e2e, e2eTests, e2eShards, perf, perfShards, perfNightly, lighthouse, classes, reasons };
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
  // Measured URLs (the warm-up never counts): the selected ones, or every one of lighthouserc.json.
  const everyUrl = lhciUrls.filter((u) => !u.includes("lhci-warmup")).length || Object.keys(LIGHTHOUSE_PAGES).length;
  const lighthouseCount = plan.lighthouse === false ? 0 : lighthouseUrls ? (JSON.parse(lighthouseUrls) as string[]).length - 1 : everyUrl;
  const roomy = plan.e2eShards + plan.perfShards <= HEAVY_SHARDS - MAX_LIGHTHOUSE_SHARDS;
  const lighthouseShards = lighthouseCount >= LIGHTHOUSE_SPLIT_AT && roomy ? MAX_LIGHTHOUSE_SHARDS : 1;
  return {
    full: String(plan.full || plan.source !== undefined || (plan.e2e === "all" && perfAll && plan.lighthouse === "all")),
    e2e: plan.e2e === "all" ? "all" : specs.length || tests.length ? "specs" : "none",
    e2e_files: [...specs.map((s) => `e2e/${s}.spec.ts`).sort(), ...tests].join(" "),
    e2e_shards: range(plan.e2eShards),
    e2e_total: String(plan.e2eShards),
    perf: String(plan.perf !== false && plan.perf.length > 0),
    perf_grep: plan.perf ? perfGrep(plan.perf) : "",
    perf_shards: range(plan.perfShards),
    perf_total: String(plan.perfShards),
    perf_nightly: String(plan.perf !== false && plan.perfNightly === true),
    lighthouse: String(plan.lighthouse !== false),
    lighthouse_urls: lighthouseUrls,
    lighthouse_shards: range(lighthouseShards),
    lighthouse_total: String(lighthouseShards),
    source_run: plan.source ? String(plan.source.run) : "",
  };
}

/** Layouts: their static import closure is in every page. */
const LAYOUTS = ["src/app/[locale]/layout.tsx", "src/app/(root)/layout.tsx"];
/** The home page: Lighthouse measures every selective pull request there, and a shared layout module only there. */
export const HOME_URL = "/en";
/**
 * Layout-closure files that change what each page ships differently: layouts and templates, stylesheets, the
 * font setup and the message selection (`src/i18n/`: which namespaces each page inlines).
 */
const PER_PAGE = /^src\/app\/(.+\/)?(layout|template)\.tsx$|\.css$|^src\/app\/fonts\.ts$|^src\/i18n\//;
/**
 * Lazy Classic panels: their own chunk, loaded when the card nears the viewport, so the static closures miss them,
 * yet their classes ship in the shared stylesheet and the panel shapes the card the home page reserves room for.
 */
const HOME_LAZY = /^src\/components\/office\//;
const BLOG_URL = Object.keys(LIGHTHOUSE_PAGES).find((p) => p.startsWith("/en/blog/"))!;
const BUILD_URL = "/en/build";

/**
 * The Lighthouse URL paths a file can move. Strings, fonts, the build steps, the dataset and the generated
 * facts move every URL; the build facts only /en/build and the posts only the measured post. In the layouts'
 * static closure, a PER_PAGE file moves every URL and any other module lands in a chunk every page loads the
 * same way, so the home page measures it (plus the measured pages whose own static imports reach it, unless every
 * page does). Any other file moves the measured pages whose static imports reach it.
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
    if (layouts.has(file) && PER_PAGE.test(file)) return "all";
    const own = pageClosures.filter(([, closure]) => closure.has(file)).map(([url]) => url);
    if (HOME_LAZY.test(file) && !own.includes(HOME_URL)) return [HOME_URL, ...own];
    if (!layouts.has(file)) return own;
    // Shared by the layout and every page (the content loader, metadata helpers): the home page measures it.
    return own.length === pageClosures.length ? [HOME_URL] : [...new Set([HOME_URL, ...own])];
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

/**
 * The complement plan of the green PR run `findSource` finds, else `fallback()` (a full plan) with the reason in
 * front. Any lookup error falls back too, so a flaky API never blocks main.
 */
export async function lookupComplement(
  find: () => Promise<SourceResult>,
  fallback: () => CiPlan,
  opts: { durations?: Durations | null; perfDurations?: Durations | null } = {},
): Promise<CiPlan> {
  let found: SourceResult;
  try {
    found = await find();
  } catch (error) {
    found = { ok: false, why: error instanceof Error ? error.message : String(error) };
  }
  if (found.ok) return complementPlan(found.record, found.source, { lighthousePaths: Object.keys(LIGHTHOUSE_PAGES), ...opts });
  const plan = fallback();
  plan.reasons.unshift(`full run: ${found.why}`);
  return plan;
}

function apiDeps(repo: string, token: string): SourceDeps {
  const get = async <T>(endpoint: string): Promise<T> => {
    const response = await fetch(`https://api.github.com/repos/${repo}/${endpoint}`, { headers: apiHeaders(token), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`GitHub API ${endpoint.split("?")[0]}: HTTP ${response.status}`);
    return (await response.json()) as T;
  };
  return {
    pullsFor: (sha) => get<MergedPr[]>(`commits/${sha}/pulls`),
    pull: (n) => get<MergedPr>(`pulls/${n}`),
    treeOf: async (sha) => (await get<{ commit: { tree: { sha: string } } }>(`commits/${sha}`)).commit.tree.sha,
    greenRuns: async (headSha) => (await get<{ workflow_runs: GreenRun[] }>(`actions/workflows/ci.yml/runs?head_sha=${headSha}&status=success&per_page=20`)).workflow_runs,
    record: async (runId) => {
      const dir = mkdtempSync(path.join(process.env.RUNNER_TEMP || tmpdir(), "ci-plan-"));
      try {
        const out = Bun.spawnSync(["gh", "run", "download", String(runId), "--repo", repo, "--name", PLAN_ARTIFACT, "--dir", dir], { stdout: "pipe", stderr: "pipe", timeout: 60_000 });
        if (out.exitCode !== 0) {
          console.log(`::notice::gh run download ${runId} exited ${out.exitCode}: ${out.stderr.toString().trim().slice(-300).replace(/\r?\n/g, " ")}`);
          return null;
        }
        const file = path.join(dir, PLAN_FILE);
        return existsSync(file) ? parseRecord(readFileSync(file, "utf8")) : null;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

/** A file at `ref` through the contents API (raw), or an error. */
async function rawFile(repo: string, ref: string, file: string, token: string): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${file}?ref=${ref}`, {
    headers: { ...apiHeaders(token), Accept: "application/vnd.github.raw" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`GitHub API contents/${file} at ${ref.slice(0, 7)}: HTTP ${response.status}`);
  return response.text();
}

/** Every tracked file of commit `sha` (the git trees API); a truncated listing is an error. */
async function trackedFiles(repo: string, sha: string, token: string): Promise<string[]> {
  const response = await fetch(`https://api.github.com/repos/${repo}/git/trees/${sha}?recursive=1`, { headers: apiHeaders(token), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`GitHub API git/trees: HTTP ${response.status}`);
  const body = (await response.json()) as { truncated?: boolean; tree: { path: string; type: string }[] };
  if (body.truncated) throw new Error("the tracked file listing is truncated");
  return body.tree.filter((e) => e.type === "blob").map((e) => e.path);
}

/** `mapDiff` of the base spec maps (dependency-free files, loaded from the PR base) and the checked-out ones. */
async function loadMapDiff(repo: string, base: string, sha: string, token: string): Promise<MapDiff> {
  const dir = mkdtempSync(path.join(process.env.RUNNER_TEMP || tmpdir(), "plan-maps-"));
  try {
    const [e2eSource, perfSource, tracked] = await Promise.all([rawFile(repo, base, PLAN_MAPS[0], token), rawFile(repo, base, PLAN_MAPS[1], token), trackedFiles(repo, sha, token)]);
    writeFileSync(path.join(dir, "e2e-plan.ts"), e2eSource);
    writeFileSync(path.join(dir, "perf-plan.ts"), perfSource);
    const baseMaps: PlanMaps = { e2e: await import(path.join(dir, "e2e-plan.ts")), perf: await import(path.join(dir, "perf-plan.ts")) };
    return mapDiff(baseMaps, HEAD_MAPS, tracked);
  } finally {
    rmSync(dir, { recursive: true, force: true });
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

/** The record of `plan` in the working directory, for the `ci-plan` artifact a later complement run reads. */
function writeRecord(plan: CiPlan, outputs: Record<string, string>) {
  writeFileSync(PLAN_FILE, JSON.stringify(recordFor(plan, outputs)));
}

async function main() {
  const { EVENT, REPO, PR, GH_TOKEN, SHA, COMPLEMENT_PR, BASE_SHA } = process.env;
  const event = EVENT === "pull_request" ? "pull_request" : "other";
  const complementPr = COMPLEMENT_PR && /^[1-9]\d*$/.test(COMPLEMENT_PR) ? Number(COMPLEMENT_PR) : null;
  const wantsComplement = EVENT === "push" || (complementPr !== null && event !== "pull_request");
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
  if (COMPLEMENT_PR && complementPr === null && event !== "pull_request") note = `complement_pr "${COMPLEMENT_PR}" is not a pull request number`;
  // A spec map change: what it moves, from the base maps; without it the plan is a full run.
  let diff: MapDiff | null = null;
  if (files?.some((f) => classify(f) === "planmap")) {
    try {
      if (!REPO || !BASE_SHA || !SHA || !GH_TOKEN) throw new Error("REPO, BASE_SHA, SHA or GH_TOKEN is missing");
      diff = await loadMapDiff(REPO, BASE_SHA, SHA, GH_TOKEN);
    } catch (error) {
      console.log(`::warning::Smart CI could not diff the spec maps (${error instanceof Error ? error.message : String(error)}); running everything.`);
    }
  }
  const root = process.cwd();
  const read = repoReader(root);
  const durations = readJson<DurationsFile>(read, "e2e/durations.json");
  const importers = files ? reverseImports(listRoots(root), read) : new Map<string, Set<string>>();
  const ownPlan = () => {
    const p = planFor(files, (f) => sharedPerfKeys(f, importers), {
      event,
      fullLabel,
      durations: durations?.e2e ?? null,
      perfDurations: durations?.perf ?? null,
      locate: locateFromDisk(root),
      pages: files ? pagesFromRepo(read) : undefined,
      mapDiff: diff,
    });
    if (note) p.reasons.unshift(`full run: ${note}`);
    return p;
  };
  let plan: CiPlan;
  if (!wantsComplement) plan = ownPlan();
  else if (REPO && SHA && GH_TOKEN) {
    plan = await lookupComplement(() => findSource(REPO, SHA, complementPr, apiDeps(REPO, GH_TOKEN)), ownPlan, { durations: durations?.e2e ?? null, perfDurations: durations?.perf ?? null });
  } else {
    plan = ownPlan();
    plan.reasons.unshift("full run: REPO, SHA or GH_TOKEN is missing, so no merged pull request run to complement");
  }
  const outputs = planOutputs(plan, lhciUrlsFrom(read));
  console.log(JSON.stringify({ outputs, reasons: plan.reasons, classes: plan.classes }, null, 2));
  writeOutputs(outputs);
  writeRecord(plan, outputs);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = Object.entries(plan.classes).map(([cls, list]) => `| \`${cls}\` | ${list!.length} | ${list!.slice(0, 5).map((f) => `\`${f}\``).join(", ")}${list!.length > 5 ? ", ..." : ""} |`);
    const summary = [
      `### Smart CI plan: ${plan.source ? "complement run" : outputs.full === "true" ? "full run" : "selective run"}`,
      "",
      ...(plan.source ? [`Source: [CI run ${plan.source.run}](${plan.source.url}) of #${plan.source.pr}`, ""] : []),
      `e2e: **${outputs.e2e}** on ${outputs.e2e_total} shard(s)${outputs.e2e_files ? ` (${outputs.e2e_files})` : ""}`,
      `3D perf gates: **${outputs.perf}**${outputs.perf === "true" ? ` on ${outputs.perf_total} shard(s)${outputs.perf_grep ? `, grep \`${outputs.perf_grep}\`` : ", the whole lane"}${outputs.perf_nightly === "true" ? ", nightly-only L1 poses included" : ""}` : ""}`,
      `Lighthouse: **${outputs.lighthouse}**${outputs.lighthouse === "true" ? `${Array.isArray(plan.lighthouse) && outputs.lighthouse_urls ? ` (${plan.lighthouse.join(", ")})` : ", every URL"} on ${outputs.lighthouse_total} shard(s)` : ""}`,
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
    const plan = planFor(null, () => [], { event: process.env.EVENT === "pull_request" ? "pull_request" : "other" });
    const outputs = planOutputs(plan);
    writeOutputs(outputs);
    writeRecord(plan, outputs);
  });
}
