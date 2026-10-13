import type { StatsFloor, StatsTopic } from "../../../src/lib/stats/protocol";

/**
 * Types of the hq-stats Cron Worker. Kept free of Cloudflare type packages on purpose (T12), like
 * functions/_lib/types.ts.
 */

/** One finalized UTC day. Written once, never recomputed (estimates can shift later). */
export interface DayRollup {
  date: string;
  /** Web Analytics (sampled estimates), production hosts only, bots excluded. */
  visits: number;
  pageViews: number;
  /** ISO alpha-2 codes seen that day, alphabetical, no counts. */
  countries: string[];
  /** Page views per floor (paths mapped by floorOfPath); zero floors left out. */
  floors: Partial<Record<StatsFloor, number>>;
  /** First-party beacon. `frozen` marks a day whose points outran Web Analytics (kept at zero). */
  mode: { threeD: number; classic: number; frozen?: true };
  /** Questions asked (not Turnstile rejects); zero topics and unknown chips left out. */
  asks: { total: number; topics: Partial<Record<StatsTopic, number>>; chips: Record<string, number> };
}

/** KV `stats:days:v1`: every finalized day, oldest first. */
export interface Ledger {
  v: 1;
  days: DayRollup[];
}

export interface WaRows {
  days: { date: string; count: number; visits: number }[];
  countries: { date: string; country: string; count: number; visits: number }[];
  paths: { date: string; path: string; count: number }[];
}

export interface AeRows {
  asks: { day: string; topic: string; chip: string; n: number }[];
  visits: { day: string; mode: string; n: number }[];
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
