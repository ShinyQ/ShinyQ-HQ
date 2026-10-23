import type { StatsExplore, StatsFloor, StatsTopic } from "../../../src/lib/stats/protocol";

/**
 * Types of the hq-stats Cron Worker. Kept free of Cloudflare type packages on purpose (T12), like
 * functions/_lib/types.ts.
 */

/** One finalized UTC day. Written once, never recomputed (estimates can shift later). */
export interface DayRollup {
  date: string;
  /**
   * The headline visit count. Web Analytics visits (sampled estimates, production hosts only, bots excluded)
   * before the first-party cutover; the site's own visit pings from it on (`visitSource`).
   */
  visits: number;
  /** Set from the cutover day on: "mixed" (Web Analytics before the cutover time, pings after) or "first-party". Missing: Web Analytics. */
  visitSource?: "mixed" | "first-party";
  /** Visit pings counted that day (from the cutover on), kept for audits even when the day is frozen. */
  firstParty?: number;
  /** The day's visit pings outran Web Analytics (`VISIT_FREEZE`): `visits` fell back to the Web Analytics visits. */
  visitsFrozen?: true;
  pageViews: number;
  /** ISO alpha-2 codes seen that day, alphabetical, no counts. */
  countries: string[];
  /** Page views per floor (paths mapped by floorOfPath); zero floors left out. */
  floors: Partial<Record<StatsFloor, number>>;
  /** First-party beacon. `frozen` marks a day whose points outran Web Analytics (kept at zero). */
  mode: { threeD: number; classic: number; frozen?: true };
  /** Questions asked (not Turnstile rejects); zero topics and unknown chips left out. */
  asks: { total: number; topics: Partial<Record<StatsTopic, number>>; chips: Record<string, number> };
  /**
   * RUM beacon (`perf_events`): sampled 3D sessions, those with a median FPS bucket, those at "55+",
   * and sessions per explore bucket ("na" and zero buckets left out). Missing on days rolled up before
   * perf existed and older than the Analytics Engine retention (no data).
   */
  perf?: DayPerf;
}

export interface DayPerf {
  sessions: number;
  measured: number;
  fps55: number;
  explore: Partial<Record<StatsExplore, number>>;
  /** The day's RUM sessions outran Web Analytics (`PERF_FREEZE`): kept at zero, like a frozen 3D vs Classic split. */
  frozen?: true;
}

/** KV `stats:days:v1`: every finalized day, oldest first. */
export interface Ledger {
  v: 1;
  days: DayRollup[];
  /**
   * ISO time (seconds, UTC) of the first visit ping seen (owner decision 2026-10-24): visits come from Web
   * Analytics before it and from the site's own pings from it on. Written once, when first seen.
   */
  cutover?: string;
}

/** `sampleInterval`: the adaptive API's average sample interval of the row (1 is unsampled; missing counts as 1 in pure tests). */
export interface WaRows {
  days: { date: string; count: number; visits: number; sampleInterval?: number }[];
  countries: { date: string; country: string; count: number; visits: number; sampleInterval?: number }[];
  paths: { date: string; path: string; count: number; sampleInterval?: number }[];
}

/**
 * KV `stats:wa-extra:v1`: Web Analytics rows of a retired site (final estimates, no sample interval), added
 * to the rows of the same days. Used once for the Pages-injected site of 2026-10-15/16 (README, "Repair").
 */
export interface WaExtra {
  v: 1;
  /** Where the rows came from (site tag and window); for people, never read by the run. */
  note: string;
  rows: WaRows;
}

export interface AeRows {
  asks: { day: string; topic: string; chip: string; n: number }[];
  /** Per day and blob2 (a mode, or "visit" for visit pings); `first`: the group's earliest point (ISO, seconds). */
  visits: { day: string; mode: string; n: number; first?: string }[];
  perf: PerfRow[];
}

export interface PerfRow {
  day: string;
  fps50: string;
  explore: string;
  n: number;
}

export interface WorkerKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface StatsWorkerEnv {
  STATS_KV: WorkerKv;
  /** Secret: read-only Account Analytics token (GitHub secret CF_EVAL_TOKEN, set by deploy.yml). */
  WA_TOKEN?: string;
  /** Secret: Cloudflare account id (kept out of the public repo). */
  WA_ACCOUNT_ID?: string;
  /** Web Analytics siteTag of the production site. */
  WA_SITE_TAG?: string;
  /** Production hosts, comma separated (local and preview traffic shares the siteTag). */
  WA_HOSTS?: string;
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface ScheduledControllerLike {
  cron: string;
  scheduledTime: number;
}
