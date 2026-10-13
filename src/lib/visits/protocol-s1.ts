/**
 * TEMPORARY copy of S1's snapshot contract (`src/lib/stats/protocol.ts`, owner plan "Public visit stats,
 * Layer 1"). Delete this file once S1 merges and point `./contract.ts` at S1's module. Hand-written
 * validator, so zod never ships to the client.
 */
export type StatsPeriod = "d30" | "all";
export type StatsTopic = "work" | "ai" | "career" | "contact" | "perspectives";
export type StatsFloor = "L1" | "L2" | "L3" | "L4" | "RF";

export interface StatsSnapshotV1 {
  v: 1;
  /** ISO, exclusive end of the last complete UTC day. */
  updatedAt: string;
  /** First rollup day (YYYY-MM-DD), the "since launch" date. */
  since: string;
  sampled: true;
  visits: Record<StatsPeriod, number>;
  pageViews: Record<StatsPeriod, number>;
  /** ISO alpha-2, sorted, no XX or T1: dots only. */
  countries: Record<StatsPeriod, string[]>;
  topFloor: Record<StatsPeriod, StatsFloor | null>;
  mode: Record<StatsPeriod, { threeD: number; classic: number }>;
  asks: Record<StatsPeriod, { total: number; topics: Record<StatsTopic, number>; chips: { id: string; topic: StatsTopic; n: number }[] }>;
}

export const STATS_PERIODS: readonly StatsPeriod[] = ["d30", "all"];
export const STATS_TOPICS: readonly StatsTopic[] = ["work", "ai", "career", "contact", "perspectives"];
const FLOORS: readonly string[] = ["L1", "L2", "L3", "L4", "RF"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isoTime = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));
const country = (v: unknown): v is string => typeof v === "string" && /^[A-Z]{2}$/.test(v) && v !== "XX" && v !== "T1";
const topic = (v: unknown): v is StatsTopic => typeof v === "string" && (STATS_TOPICS as readonly string[]).includes(v);

function perPeriod(v: unknown, ok: (x: unknown) => boolean): boolean {
  return isObj(v) && STATS_PERIODS.every((p) => ok(v[p]));
}

function asks(v: unknown): boolean {
  if (!isObj(v) || !count(v.total) || !isObj(v.topics) || !Array.isArray(v.chips)) return false;
  const topics = v.topics;
  if (!STATS_TOPICS.every((t) => count(topics[t]))) return false;
  return v.chips.every((c) => isObj(c) && typeof c.id === "string" && /^[a-z0-9-]{1,64}$/.test(c.id) && topic(c.topic) && count(c.n));
}

/** The snapshot when `value` matches the contract exactly, else null. */
export function parseStatsSnapshot(value: unknown): StatsSnapshotV1 | null {
  if (!isObj(value) || value.v !== 1 || value.sampled !== true || !isoTime(value.updatedAt) || !isoDate(value.since)) return null;
  const ok =
    perPeriod(value.visits, count) &&
    perPeriod(value.pageViews, count) &&
    perPeriod(value.countries, (c) => Array.isArray(c) && c.every(country)) &&
    perPeriod(value.topFloor, (f) => f === null || (typeof f === "string" && FLOORS.includes(f))) &&
    perPeriod(value.mode, (m) => isObj(m) && count(m.threeD) && count(m.classic)) &&
    perPeriod(value.asks, asks);
  return ok ? (value as unknown as StatsSnapshotV1) : null;
}
