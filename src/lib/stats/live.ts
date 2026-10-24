/**
 * The live tail of the public visit count (owner decision 2026-10-24), shared by the hq-stats Worker (writes
 * it next to the snapshot every hour, serves `GET /live` through the Pages service binding) and
 * `GET /api/stats` (adds the visit pings that arrived since the run). Server-only: never imported by the
 * client, so the client bundle stays as it is.
 *
 * `from` is where the snapshot's first-party count of the days it has not stored yet starts (ISO seconds,
 * UTC: the start of the oldest unstored day, or the cutover when later), `visits` the pings the snapshot
 * already counted since `from`. `from` is null when there is nothing live to add (a frozen day in the tail).
 * `updatedAt` equals the snapshot's, so a stale pair (KV is eventually consistent) is never merged.
 */
export const STATS_LIVE_KEY = "stats:live:v1";
/** Path of the Worker's live count (`GET /live?from=<ISO seconds>`), reachable only through the service binding. */
export const LIVE_PATH = "/live";
/** The oldest `from` the Worker answers for: the tail is a day or two, a week leaves room for missed runs. */
export const LIVE_MAX_AGE_MS = 8 * 86_400_000;

export interface StatsLive {
  v: 1;
  updatedAt: string;
  from: string | null;
  visits: number;
}

export const ISO_SECOND_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

/** The live record when `value` is exactly the contract, else null. */
export function parseStatsLive(value: unknown): StatsLive | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 4 || !["v", "updatedAt", "from", "visits"].every((k) => keys.includes(k))) return null;
  if (o.v !== 1 || typeof o.updatedAt !== "string" || !ISO_TIME.test(o.updatedAt)) return null;
  if (o.from !== null && (typeof o.from !== "string" || !ISO_SECOND_RE.test(o.from))) return null;
  if (typeof o.visits !== "number" || !Number.isSafeInteger(o.visits) || o.visits < 0) return null;
  return { v: 1, updatedAt: o.updatedAt, from: o.from, visits: o.visits };
}
