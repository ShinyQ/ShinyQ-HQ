/**
 * Public visit stats (Layer 1): the snapshot contract served by `GET /api/stats`, written every 4 hours by
 * the `hq-stats` Cron Worker (workers/stats/) and read by the 3D HQ and the Classic site. Pure and
 * client-safe: no imports, a hand-written validator (no zod on the client).
 *
 * Every filter combination (period, topic) is answered by one object, so the endpoint takes no
 * parameters. Web Analytics numbers (visits, page views, countries, top floor) are sampled estimates;
 * `mode` and `asks` come from first-party Analytics Engine events. Countries are ISO alpha-2 codes
 * without counts (dots only), sorted alphabetically so the order leaks no ranking.
 */
export const STATS_PERIODS = ["d30", "all"] as const;
/** Same ids as the Ask the HQ topic pills (`ASK_TOPICS` in src/ask/suggestions.ts; a test keeps them equal). */
export const STATS_TOPICS = ["work", "ai", "career", "contact", "perspectives"] as const;
export const STATS_FLOORS = ["L1", "L2", "L3", "L4", "RF"] as const;
/** KV key of the public snapshot in `STATS_KV`. */
export const STATS_KEY = "stats:v1";
/** Same-origin endpoint: 200 with a snapshot, or 204 when the kill switch is off or no snapshot exists yet. */
export const STATS_ENDPOINT = "/api/stats";
/** At most this many chips in one period (the curated bank has about 40). */
export const STATS_MAX_CHIPS = 100;
/** Explore time buckets of the RUM beacon (`RUM_TIMES` in src/lib/rum/protocol.ts without "na"; a test keeps them equal). */
export const STATS_EXPLORE = ["lt3s", "3-5s", "5-8s", "8-12s", "12-20s", "20s+"] as const;

export type StatsPeriod = (typeof STATS_PERIODS)[number];
export type StatsTopic = (typeof STATS_TOPICS)[number];
export type StatsFloor = (typeof STATS_FLOORS)[number];
export type StatsExplore = (typeof STATS_EXPLORE)[number];

export interface StatsChip {
  /** Curated question id from content/ask/suggestions.json. */
  id: string;
  topic: StatsTopic;
  n: number;
}

export interface StatsAsks {
  /** Every question asked (answered, unknown, declined or failed); questions without a topic count here only. */
  total: number;
  topics: Record<StatsTopic, number>;
  /** Curated chips asked, sorted by n (desc), then id. */
  chips: StatsChip[];
}

/**
 * The site's own 3D performance, from the RUM beacon (`perf_events`, one point per sampled 3D session,
 * weighted by `_sample_interval`). Invariant: `fps55 <= measured <= sessions`.
 */
export interface StatsPerf {
  /** Sampled 3D sessions. */
  sessions: number;
  /** Sessions with a median FPS bucket (not "na"). */
  measured: number;
  /** Sessions whose median FPS bucket is "55+". */
  fps55: number;
  /** Median explore time bucket among sessions that reached explore; null without any. */
  explore: StatsExplore | null;
}

export interface StatsSnapshotV1 {
  v: 1;
  /** ISO, end of the last complete UTC day (the next midnight, exclusive). */
  updatedAt: string;
  /** First rollup day (YYYY-MM-DD), the "since launch" date. */
  since: string;
  /** Web Analytics numbers are estimates. */
  sampled: true;
  visits: Record<StatsPeriod, number>;
  pageViews: Record<StatsPeriod, number>;
  /** ISO alpha-2, no XX or T1, dots only, alphabetical. */
  countries: Record<StatsPeriod, string[]>;
  topFloor: Record<StatsPeriod, StatsFloor | null>;
  /** First-party beacon: page lifetimes that used the 3D view and the Classic site (one that used both counts on both sides). */
  mode: Record<StatsPeriod, { threeD: number; classic: number }>;
  asks: Record<StatsPeriod, StatsAsks>;
  /** Optional (added after launch): absent until the Worker wrote a day with perf data. */
  perf?: Record<StatsPeriod, StatsPerf>;
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const CHIP_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** ISO 3166-1 alpha-2 shape; `XX` (unknown) and `T1` (Tor) never pass. */
export const isCountryCode = (value: unknown): value is string => typeof value === "string" && /^[A-Z]{2}$/.test(value) && value !== "XX";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(value, k));
}

function perPeriod<T>(value: unknown, read: (v: unknown) => T | null): Record<StatsPeriod, T> | null {
  if (!exactKeys(value, STATS_PERIODS)) return null;
  const d30 = read(value.d30);
  const all = read(value.all);
  return d30 === null || all === null ? null : { d30, all };
}

const readCount = (v: unknown): number | null => (count(v) ? v : null);

function readCountries(v: unknown): string[] | null {
  if (!Array.isArray(v) || !v.every(isCountryCode) || new Set(v).size !== v.length) return null;
  return [...v];
}

const readFloor = (v: unknown): { floor: StatsFloor | null } | null => (v === null ? { floor: null } : oneOf(STATS_FLOORS, v) ? { floor: v } : null);

function readMode(v: unknown): { threeD: number; classic: number } | null {
  if (!exactKeys(v, ["threeD", "classic"]) || !count(v.threeD) || !count(v.classic)) return null;
  return { threeD: v.threeD, classic: v.classic };
}

function readChip(v: unknown): StatsChip | null {
  if (!exactKeys(v, ["id", "topic", "n"])) return null;
  if (typeof v.id !== "string" || v.id.length > 64 || !CHIP_ID.test(v.id) || !oneOf(STATS_TOPICS, v.topic) || !count(v.n)) return null;
  return { id: v.id, topic: v.topic, n: v.n };
}

function readAsks(v: unknown): StatsAsks | null {
  if (!exactKeys(v, ["total", "topics", "chips"]) || !count(v.total)) return null;
  if (!exactKeys(v.topics, STATS_TOPICS)) return null;
  const topicsIn = v.topics;
  if (!STATS_TOPICS.every((t) => count(topicsIn[t]))) return null;
  if (!Array.isArray(v.chips) || v.chips.length > STATS_MAX_CHIPS) return null;
  const chips: StatsChip[] = [];
  for (const raw of v.chips) {
    const chip = readChip(raw);
    if (!chip || chips.some((c) => c.id === chip.id)) return null;
    chips.push(chip);
  }
  const topics = Object.fromEntries(STATS_TOPICS.map((t) => [t, topicsIn[t] as number])) as Record<StatsTopic, number>;
  return { total: v.total, topics, chips };
}

function readPerf(v: unknown): StatsPerf | null {
  if (!exactKeys(v, ["sessions", "measured", "fps55", "explore"])) return null;
  if (!count(v.sessions) || !count(v.measured) || !count(v.fps55) || v.fps55 > v.measured || v.measured > v.sessions) return null;
  if (v.explore !== null && !oneOf(STATS_EXPLORE, v.explore)) return null;
  return { sessions: v.sessions, measured: v.measured, fps55: v.fps55, explore: v.explore };
}

const KEYS = ["v", "updatedAt", "since", "sampled", "visits", "pageViews", "countries", "topFloor", "mode", "asks"] as const;
const KEYS_PERF = [...KEYS, "perf"] as const;

/**
 * The snapshot when `value` is exactly the contract (no extra keys at any level), else null. Returns a
 * fresh object. `perf` is optional: an invalid perf block is dropped on its own, so the visit stats keep
 * working.
 */
export function parseStatsSnapshot(value: unknown): StatsSnapshotV1 | null {
  if (!exactKeys(value, KEYS) && !exactKeys(value, KEYS_PERF)) return null;
  if (value.v !== 1 || value.sampled !== true) return null;
  if (typeof value.updatedAt !== "string" || !ISO_TIME.test(value.updatedAt)) return null;
  if (typeof value.since !== "string" || !ISO_DAY.test(value.since)) return null;
  const visits = perPeriod(value.visits, readCount);
  const pageViews = perPeriod(value.pageViews, readCount);
  const countries = perPeriod(value.countries, readCountries);
  const floors = perPeriod(value.topFloor, readFloor);
  const mode = perPeriod(value.mode, readMode);
  const asks = perPeriod(value.asks, readAsks);
  if (!visits || !pageViews || !countries || !floors || !mode || !asks) return null;
  const perf = "perf" in value ? perPeriod(value.perf, readPerf) : null;
  return {
    v: 1,
    updatedAt: value.updatedAt,
    since: value.since,
    sampled: true,
    visits,
    pageViews,
    countries,
    topFloor: { d30: floors.d30.floor, all: floors.all.floor },
    mode,
    asks,
    ...(perf ? { perf } : {}),
  };
}
