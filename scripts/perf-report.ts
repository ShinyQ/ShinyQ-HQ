/**
 * Pure helpers behind scripts/perf-summary.ts: per-chunk JS diffs (Lighthouse CI and the 3D bytes
 * gate), the perf gate tables, the nightly timeline and the shader program baseline. No Bun, no
 * Playwright and no `@/` imports, so the Lighthouse job runs it without `bun install` and Vitest tests
 * it in node.
 */
import { BYTES_3D_BUDGET, PAGE_JS_BUDGET, RENDER_BUDGET, WARN_RATIO } from "../e2e/budgets";

export type ChunkMap = Record<string, number>;
export type Tier = "lite" | "full";

export interface GpuCountersEntry {
  geometries: number;
  textures: number;
  programs: number;
}

/** One JSON file in perf-report/ (written by `writePerfEntry` in e2e/perf/helpers.ts). */
export type PerfEntry =
  | { kind: "bytes3d"; tier: Tier; js: ChunkMap; other: ChunkMap; floors?: Partial<Record<"L3" | "L4" | "RF", number>>; sessionTotal?: number }
  | { kind: "floor"; tier: Tier; floor: string; sceneCalls: number; postCalls: number; triangles: number; programs: number; geometries: number; textures: number }
  | { kind: "peak"; tier: Tier; scenario: string; sceneCalls: number; postCalls: number; triangles: number; frames: number }
  | { kind: "memory"; tier: Tier; trips: number; before: GpuCountersEntry; after: GpuCountersEntry; heapDeltaBytes: number }
  | { kind: "timeline"; profile: string; scenario: string; run: number; release: string | null; marks: Record<string, number | null> };

type EntryOf<K extends PerfEntry["kind"]> = Extract<PerfEntry, { kind: K }>;

export interface Summary {
  markdown: string;
  warnings: string[];
}

export interface ProgramBaseline {
  programs: Record<Tier, Record<string, number>>;
}

const KINDS = new Set<string>(["bytes3d", "floor", "peak", "memory", "timeline"]);

export function isPerfEntry(value: unknown): value is PerfEntry {
  return typeof value === "object" && value !== null && !Array.isArray(value) && KINDS.has(String((value as { kind?: unknown }).kind));
}

export function entryId(e: PerfEntry): string {
  switch (e.kind) {
    case "bytes3d":
      return `bytes3d-${e.tier}`;
    case "floor":
      return `floor-${e.tier}-${e.floor}`;
    case "peak":
      return `peak-${e.tier}-${e.scenario}`;
    case "memory":
      return `memory-${e.tier}`;
    case "timeline":
      return `timeline-${e.profile}-${e.scenario}-${e.run}`;
  }
}

export const sum = (m: ChunkMap): number => Object.values(m).reduce((a, b) => a + b, 0);
export const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
const signedKb = (bytes: number): string => (bytes === 0 ? "0.0 KB" : `${bytes > 0 ? "+" : "-"}${kb(Math.abs(bytes))}`);
const signedInt = (n: number): string => (n > 0 ? `+${n}` : `${n}`);
const percent = (part: number, whole: number): number => Math.round((part / whole) * 100);
const withDelta = (now: number, before: number | undefined): string => (before === undefined || before === now ? `${now}` : `${now} (${signedInt(now - before)})`);

/** `/_next/static/...` chunks by file name (content hash), anything else by path. */
export function chunkName(url: string): string {
  const { pathname } = new URL(url, "http://local");
  return pathname.startsWith("/_next/static/") ? pathname.slice(pathname.lastIndexOf("/") + 1) : pathname;
}

export interface LhrLike {
  requestedUrl?: string;
  audits?: Record<string, { details?: { items?: unknown[] } } | undefined>;
}

export function isLhr(value: unknown): value is LhrLike {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as LhrLike;
  return typeof v.requestedUrl === "string" && Boolean(v.audits?.["network-requests"]);
}

/** Script requests of one Lighthouse run by chunk name (transfer bytes, like `resource-summary:script:size`). */
export function lhrScripts(lhr: LhrLike): ChunkMap {
  const out: ChunkMap = {};
  for (const raw of lhr.audits?.["network-requests"]?.details?.items ?? []) {
    const item = raw as { url?: string; resourceType?: string; transferSize?: number };
    if (item.resourceType !== "Script" || !item.url || !item.transferSize) continue;
    const name = chunkName(item.url);
    out[name] = Math.max(out[name] ?? 0, item.transferSize);
  }
  return out;
}

/** Page path to its scripts over every run of that page (the largest transfer per chunk). */
export function pagesFromLhrs(lhrs: readonly LhrLike[]): Record<string, ChunkMap> {
  const pages: Record<string, ChunkMap> = {};
  for (const lhr of lhrs) {
    if (!lhr.requestedUrl) continue;
    const url = new URL(lhr.requestedUrl);
    // The warm-up run (`/en?lhci-warmup=1`) is never asserted (lighthouserc.json matches `^[^?]+$`).
    if (url.search) continue;
    const page = url.pathname;
    const merged = (pages[page] ??= {});
    for (const [name, bytes] of Object.entries(lhrScripts(lhr))) merged[name] = Math.max(merged[name] ?? 0, bytes);
  }
  return pages;
}

const TOP_CHUNKS = 10;

/** Total, budget share and the chunks added or removed against main (or the largest ones without a baseline). */
export function renderChunkDiff(title: string, head: ChunkMap, base?: ChunkMap, budget?: number): Summary {
  const total = sum(head);
  const parts = [`Total ${kb(total)}`];
  if (budget) parts.push(`${percent(total, budget)}% of ${kb(budget)}`);
  parts.push(base ? `main ${kb(sum(base))}, ${signedKb(total - sum(base))}` : "no main baseline");
  const lines = [`#### ${title}`, "", `${parts.join(", ")}.`, ""];
  if (base) {
    const added = Object.entries(head).filter(([name]) => !(name in base)).sort((a, b) => b[1] - a[1]);
    const removed = Object.entries(base).filter(([name]) => !(name in head)).sort((a, b) => b[1] - a[1]);
    if (added.length === 0 && removed.length === 0) lines.push("Same chunks as main.");
    else {
      lines.push("| Chunk | main | this run |", "|---|---:|---:|");
      for (const [name, bytes] of removed) lines.push(`| \`${name}\` | ${kb(bytes)} | |`);
      for (const [name, bytes] of added) lines.push(`| \`${name}\` | | ${kb(bytes)} |`);
    }
  } else {
    lines.push("| Largest chunks | this run |", "|---|---:|");
    for (const [name, bytes] of Object.entries(head).sort((a, b) => b[1] - a[1]).slice(0, TOP_CHUNKS)) lines.push(`| \`${name}\` | ${kb(bytes)} |`);
  }
  lines.push("", "");
  const warnings = budget && total >= WARN_RATIO * budget ? [`${title}: ${kb(total)} is ${percent(total, budget)}% of the ${kb(budget)} budget`] : [];
  return { markdown: lines.join("\n"), warnings };
}

/** Page View JS per Lighthouse page against the same pages on main. */
export function renderLhci(head: readonly LhrLike[], base: readonly LhrLike[]): Summary {
  const headPages = pagesFromLhrs(head);
  const basePages = pagesFromLhrs(base);
  const out: Summary = {
    markdown: "### Page View JavaScript per chunk\n\nTransfer bytes from Lighthouse CI. Chunk names are content hashes, so a changed chunk shows as one removed and one added row.\n\n",
    warnings: [],
  };
  const pages = Object.keys(headPages).sort();
  for (const page of pages) {
    const s = renderChunkDiff(page, headPages[page], base.length ? basePages[page] : undefined, PAGE_JS_BUDGET);
    out.markdown += s.markdown;
    out.warnings.push(...s.warnings);
  }
  if (pages.length === 0) out.markdown += "No Lighthouse reports found.\n";
  return out;
}

const pick = <K extends PerfEntry["kind"]>(entries: readonly PerfEntry[], kind: K): EntryOf<K>[] =>
  entries.filter((e): e is EntryOf<K> => e.kind === kind).sort((a, b) => entryId(a).localeCompare(entryId(b)));

function warnSceneCalls(warnings: string[], label: string, calls: number) {
  if (calls >= WARN_RATIO * RENDER_BUDGET.sceneCalls) warnings.push(`${label}: ${calls} scene calls is ${percent(calls, RENDER_BUDGET.sceneCalls)}% of the ${RENDER_BUDGET.sceneCalls} budget`);
}

/** The 3D perf gate tables (bytes, settled floors, peaks, memory) against the last main run. */
export function renderGates(head: readonly PerfEntry[], base: readonly PerfEntry[]): Summary {
  const out: Summary = { markdown: "### 3D perf gates\n\n", warnings: [] };
  const before = new Map(base.map((e) => [entryId(e), e]));
  const baseOf = <K extends PerfEntry["kind"]>(e: EntryOf<K>) => before.get(entryId(e)) as EntryOf<K> | undefined;

  for (const e of pick(head, "bytes3d")) {
    const s = renderChunkDiff(`3D JS after the gate (${e.tier})`, e.js, baseOf(e)?.js, BYTES_3D_BUDGET.failAt);
    const other = Object.entries(e.other).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k} ${kb(v)}`).join(", ");
    out.markdown += `${s.markdown}Other 3D-path bytes: ${other || "none"}.\n\n`;
    if (e.floors) {
      const caps = BYTES_3D_BUDGET.floors;
      const parts = (Object.keys(caps) as (keyof typeof caps)[])
        .filter((f) => e.floors?.[f] !== undefined)
        .map((f) => `${f} ${kb(e.floors?.[f] ?? 0)} of ${kb(caps[f])}`);
      const total = e.sessionTotal === undefined ? "" : ` Session total with every floor chunk: ${kb(e.sessionTotal)} of ${kb(BYTES_3D_BUDGET.session[e.tier])}.`;
      if (parts.length) out.markdown += `Floor chunks (loaded on demand): ${parts.join(", ")}.${total}\n\n`;
    }
    out.warnings.push(...s.warnings);
  }

  const floors = pick(head, "floor");
  if (floors.length) {
    out.markdown += "#### Settled floors\n\n| Tier | Floor | Scene calls | Post passes | Triangles | Programs | Geometries | Textures |\n|---|---|---:|---:|---:|---:|---:|---:|\n";
    for (const f of floors) {
      const b = baseOf(f);
      out.markdown += `| ${f.tier} | ${f.floor} | ${withDelta(f.sceneCalls, b?.sceneCalls)} | ${withDelta(f.postCalls, b?.postCalls)} | ${withDelta(f.triangles, b?.triangles)} | ${withDelta(f.programs, b?.programs)} | ${withDelta(f.geometries, b?.geometries)} | ${withDelta(f.textures, b?.textures)} |\n`;
      warnSceneCalls(out.warnings, `${f.tier} ${f.floor}`, f.sceneCalls);
    }
    out.markdown += "\n";
  }

  const peaks = pick(head, "peak");
  if (peaks.length) {
    out.markdown += "#### Peaks (every frame of the window)\n\n| Tier | Scenario | Scene calls | Post passes | Triangles | Frames |\n|---|---|---:|---:|---:|---:|\n";
    for (const p of peaks) {
      const b = baseOf(p);
      out.markdown += `| ${p.tier} | ${p.scenario} | ${withDelta(p.sceneCalls, b?.sceneCalls)} | ${withDelta(p.postCalls, b?.postCalls)} | ${withDelta(p.triangles, b?.triangles)} | ${p.frames} |\n`;
      warnSceneCalls(out.warnings, `${p.tier} ${p.scenario}`, p.sceneCalls);
    }
    out.markdown += "\n";
  }

  const memory = pick(head, "memory");
  if (memory.length) {
    out.markdown += "#### Memory after round trips (deltas)\n\n| Tier | Round trips | Geometries | Textures | Programs | JS heap |\n|---|---:|---:|---:|---:|---:|\n";
    for (const m of memory) {
      const d = (k: keyof GpuCountersEntry) => m.after[k] - m.before[k];
      out.markdown += `| ${m.tier} | ${m.trips} | ${d("geometries")} | ${d("textures")} | ${d("programs")} | ${(m.heapDeltaBytes / (1024 * 1024)).toFixed(1)} MB |\n`;
    }
    out.markdown += "\n";
  }

  if (out.markdown === "### 3D perf gates\n\n") out.markdown += "No perf entries found.\n";
  return out;
}

export const TIMELINE_MARKS = ["coverFcp", "headline", "bootRelease", "firstFrame", "introStart", "introEnd", "explore", "firstDrawer"] as const;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const seconds = (ms: number | null): string => (ms === null ? "-" : `${(ms / 1000).toFixed(2)} s`);

/** Nightly game-first timeline: medians per profile and scenario, the previous run in brackets. Trend only. */
export function renderTimeline(head: readonly PerfEntry[], base: readonly PerfEntry[]): Summary {
  const rows = pick(head, "timeline");
  const previous = pick(base, "timeline");
  const groups = [...new Set(rows.map((r) => `${r.profile}|${r.scenario}`))].sort();
  const header = ["Profile", "Scenario", "Release", ...TIMELINE_MARKS];
  const align = ["---", "---", "---", ...TIMELINE_MARKS.map(() => "---:")];
  let markdown = `### Game-first timeline (trend only)\n\nMedian over runs, seconds from navigation start; the previous nightly run in brackets.\n\n| ${header.join(" | ")} |\n|${align.join("|")}|\n`;
  for (const group of groups) {
    const [profile, scenario] = group.split("|");
    const now = rows.filter((r) => r.profile === profile && r.scenario === scenario);
    const then = previous.filter((r) => r.profile === profile && r.scenario === scenario);
    const med = (list: typeof rows, mark: string) => median(list.map((r) => r.marks[mark]).filter((v): v is number => typeof v === "number"));
    const cell = (mark: string) => {
      const a = med(now, mark);
      const b = med(then, mark);
      return a === null || b === null ? seconds(a) : `${seconds(a)} (${seconds(b)})`;
    };
    const release = [...new Set(now.map((r) => r.release ?? "none"))].join(", ");
    markdown += `| ${profile} | ${scenario} | ${release} | ${TIMELINE_MARKS.map(cell).join(" | ")} |\n`;
  }
  if (groups.length === 0) markdown += "No timeline entries found.\n";
  return { markdown, warnings: [] };
}

/** Floor readings merged into the previous baseline (floors not measured this run keep their value), sorted. */
export function programBaseline(entries: readonly PerfEntry[], previous?: ProgramBaseline): ProgramBaseline {
  const programs: Record<Tier, Record<string, number>> = { lite: { ...(previous?.programs.lite ?? {}) }, full: { ...(previous?.programs.full ?? {}) } };
  for (const f of pick(entries, "floor")) programs[f.tier][f.floor] = f.programs;
  const sorted = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));
  return { programs: { lite: sorted(programs.lite), full: sorted(programs.full) } };
}
