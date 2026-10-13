import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
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
 * reads 60 frames apart and at least 5 s (an idle callback can wait that long on a busy CPU).
 */
export async function waitForStablePrograms(page: Page, timeout = 90_000): Promise<number> {
  const started = Date.now();
  const deadline = started + timeout;
  let last = await programState(page);
  let same = 0;
  while (Date.now() < deadline) {
    await waitForFrames(page, 60);
    const now = await programState(page);
    same = now === last ? same + 1 : 0;
    last = now;
    if (same >= 2 && Date.now() - started >= 5_000) return Number(now.split("|")[0]);
  }
  throw new Error(`shader programs still changing after ${timeout} ms (last ${last})`);
}
