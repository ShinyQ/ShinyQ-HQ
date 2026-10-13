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

/**
 * Shader programs once they stop changing: neighbour floors mount on idle and compile when first
 * drawn, so wait until two reads 60 frames apart agree.
 */
export async function waitForStablePrograms(page: Page, timeout = 60_000): Promise<number> {
  const deadline = Date.now() + timeout;
  let last = (await readGpuCounters(page)).programs;
  while (Date.now() < deadline) {
    await waitForFrames(page, 60);
    const now = (await readGpuCounters(page)).programs;
    if (now === last) return now;
    last = now;
  }
  throw new Error(`shader programs still changing after ${timeout} ms (last ${last})`);
}
