/**
 * User Timing marks of the game-first timeline (nightly e2e/perf/timeline.spec.ts) and the RUM beacon
 * (time to explore). The names are a contract with the timeline spec; each mark is written once per
 * page load. Cheap, no imports: the boot-first head script repeats the `hq:boot-release` name inline.
 */
/** Element Timing identifier on the boot card title (`elementtiming`): the timeline's headline column. */
export const HEADLINE_TIMING_ID = "hq-headline";

export const PERF_MARKS = {
  /** The boot cover came off; detail: ready, page, static or timeout. */
  bootRelease: "hq:boot-release",
  /** The canvas rendered its first frame. */
  firstFrame: "hq:first-frame",
  /** Boot rover was pressed: the intro starts. */
  introStart: "hq:intro-start",
  /** The intro handed over to explore. */
  introEnd: "hq:intro-end",
  /** First interactive phase (explore, room, palette, ...), with or without an intro. */
  explore: "hq:explore",
  /** The first Glass Drawer opened. */
  firstDrawer: "hq:first-drawer",
} as const;

export type PerfMarkName = (typeof PERF_MARKS)[keyof typeof PERF_MARKS];

export function markOnce(name: PerfMarkName, detail?: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try {
    if (performance.getEntriesByName(name, "mark").length > 0) return;
    performance.mark(name, detail === undefined ? undefined : { detail });
  } catch {
    // Marks are diagnostics: they never break the page.
  }
}

/** Milliseconds since navigation start, or null before the mark was written. */
export function markTime(name: PerfMarkName): number | null {
  if (typeof performance === "undefined" || typeof performance.getEntriesByName !== "function") return null;
  return performance.getEntriesByName(name, "mark")[0]?.startTime ?? null;
}
