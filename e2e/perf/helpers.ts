import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, type Page } from "@playwright/test";
import { PROGRAM_SETTLE, programSettleMs } from "../budgets";
import { entryId, type PerfEntry } from "../../scripts/perf-report";
import { readGpuCounters, waitForFrames } from "../hq";

/** perf-report/ (gitignored): one JSON file per measurement, read by `bun scripts/perf-summary.ts`. */
export const PERF_REPORT_DIR = process.env.PERF_REPORT_DIR ?? "perf-report";

/** Writes (or overwrites) this measurement's entry; call before asserting, so a failed gate still reports. */
export function writePerfEntry(entry: PerfEntry): void {
  mkdirSync(PERF_REPORT_DIR, { recursive: true });
  writeFileSync(path.join(PERF_REPORT_DIR, `${entryId(entry)}.json`), `${JSON.stringify(entry, null, 2)}\n`);
}

/** Programs plus the floors P2's precompile has warmed (`__hq.render.warmFloors()`, absent on older builds). */
async function programState(page: Page): Promise<string> {
  const programs = (await readGpuCounters(page)).programs;
  const warm = await page.evaluate(() => (window as unknown as { __hq: { render?: { warmFloors(): string[] } } }).__hq.render?.warmFloors().sort().join(",") ?? "");
  return `${programs}|${warm}`;
}

/**
 * Shader programs once they stop changing: neighbour floors mount on idle and compile asynchronously
 * (P6 FloorPrep, P2 precompile), so wait until the program count and the warmed floors agree over three
 * reads `PROGRAM_SETTLE.frames` frames apart and at least 5 s (an idle callback can wait that long on a busy CPU).
 * The deadline follows the frame rate (`programSettleMs`: room for `PROGRAM_SETTLE.windows` windows at the slowest
 * window's frame time, `timeout` as the floor, a hard ceiling); time granted past the floor extends the test's timeout.
 * A timeout names its cause: programs that changed, or frames too slow for the windows (no change seen).
 */
export async function waitForStablePrograms(page: Page, timeout: number = PROGRAM_SETTLE.floorMs): Promise<number> {
  const { frames } = PROGRAM_SETTLE;
  const info = test.info();
  const started = Date.now();
  let allowed = timeout;
  let msPerFrame = 0;
  let last = await programState(page);
  let same = 0;
  let windows = 0;
  let changes = 0;
  while (Date.now() - started < allowed) {
    const windowStarted = Date.now();
    await waitForFrames(page, frames);
    msPerFrame = Math.max(msPerFrame, (Date.now() - windowStarted) / frames);
    const now = await programState(page);
    windows += 1;
    if (now !== last) changes += 1;
    same = now === last ? same + 1 : 0;
    last = now;
    if (same >= 2 && Date.now() - started >= 5_000) return Number(now.split("|")[0]);
    const next = programSettleMs(msPerFrame, timeout);
    if (next > allowed) {
      if (info.timeout > 0) info.setTimeout(info.timeout + (next - allowed));
      allowed = next;
    }
  }
  const pace = `${frames} frames a window, slowest about ${Math.round(msPerFrame)} ms a frame`;
  const cause = changes ? `still changing (${changes} of ${windows} windows changed)` : `unchanged, but only ${windows} of 2 windows ran (a slow runner, not churn)`;
  throw new Error(`shader programs ${cause} after ${Date.now() - started} ms (${pace}; deadline ${allowed} ms; last ${last})`);
}
