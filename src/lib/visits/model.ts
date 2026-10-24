import type { Locale } from "@/content/locales";
import { intlLocale } from "@/lib/format";
import type { StatsExplore } from "@/lib/stats/protocol";
import { STATS_TOPICS, type StatsFloor, type StatsPeriod, type StatsSnapshotV1, type StatsTopic } from "./contract";

/**
 * Pure view model for the public visit stats (owner plan "Public visit stats, Layer 1", S2): freshness,
 * number formatting and the filtered view every surface renders (RF station and drawer, L1 tile, Classic
 * ticker and Contact section). No React, no three, client-safe.
 */

/** The Topic filter: All plus the three topics the owner picked (contact and perspectives count under All). */
export type TopicFilter = "all" | "work" | "ai" | "career";
export const TOPIC_FILTERS: readonly TopicFilter[] = ["all", "work", "ai", "career"];
/** The Period radio order: the default window (since launch, owner decision 2026-10-23) first. */
export const PERIODS: readonly StatsPeriod[] = ["all", "d30"];
/** Suggested questions listed per view (owner decision 2026-10-23): the most picked ones, in both placements. */
export const TOP_CHIPS = 5;

const HOUR = 3_600_000;
/** After this the stats show a "delayed" note (the snapshot refreshes every hour, so 3 missed runs). */
export const DELAYED_AFTER_MS = 3 * HOUR;
/** After this every surface hides the stats. */
export const HIDDEN_AFTER_MS = 7 * 24 * HOUR;

export type Freshness = "fresh" | "delayed" | "hidden";

export function freshness(snapshot: StatsSnapshotV1 | null, now: number): Freshness {
  if (!snapshot) return "hidden";
  const age = now - Date.parse(snapshot.updatedAt);
  if (!Number.isFinite(age) || age > HIDDEN_AFTER_MS) return "hidden";
  return age > DELAYED_AFTER_MS ? "delayed" : "fresh";
}

/** The UTC day of the snapshot's last data (`updatedAt` is the run time; a midnight run reports the previous day), YYYY-MM-DD. */
export function lastUpdatedDay(snapshot: StatsSnapshotV1): string {
  return new Date(Date.parse(snapshot.updatedAt) - 1).toISOString().slice(0, 10);
}

const formatters = new Map<string, Intl.NumberFormat>();
function nf(locale: Locale, compact: "short" | "long" | null): Intl.NumberFormat {
  const key = `${locale}:${compact}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(intlLocale(locale), compact ? { notation: "compact", compactDisplay: compact, maximumFractionDigits: 1 } : { maximumFractionDigits: 0 });
    formatters.set(key, f);
  }
  return f;
}

/** Exact grouped numbers below 10,000 ("1,234", "1.234"), CLDR compact above ("12.3K", "12,3 rb"). */
export function formatCount(n: number, locale: Locale): string {
  return n < 10_000 ? nf(locale, null).format(n) : nf(locale, "short").format(n);
}

/** The same number for screen readers ("12.3 thousand", "12,3 ribu"). */
export function formatCountLong(n: number, locale: Locale): string {
  return n < 10_000 ? nf(locale, null).format(n) : nf(locale, "long").format(n);
}

/** Whole percents of `values` that add up to 100 (largest remainder); all zeros stay zeros. */
export function largestRemainder(values: readonly number[]): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) return values.map(() => 0);
  const exact = values.map((v) => (v / sum) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

export interface VisitsView {
  period: StatsPeriod;
  topic: TopicFilter;
  visits: number;
  pageViews: number;
  /** ISO alpha-2, as the snapshot lists them (alphabetical): dots only, never per-country numbers. */
  countries: readonly string[];
  topFloor: StatsFloor | null;
  mode: { threeD: number; classic: number; threeDShare: number; classicShare: number };
  asks: {
    /** Questions asked (All) or questions about the picked topic. */
    total: number;
    /** Topic counts with their share of all questions that have a topic (one entry under a single topic). */
    topics: { topic: StatsTopic; n: number; share: number }[];
    /** Curated chip counts, most asked first (ties by id), narrowed to the picked topic, at most TOP_CHIPS. */
    chips: { id: string; topic: StatsTopic; n: number }[];
  };
}

/** Every filter combination answered from the one snapshot. */
export function visitsView(s: StatsSnapshotV1, period: StatsPeriod, topic: TopicFilter): VisitsView {
  const mode = s.mode[period];
  const [threeDShare, classicShare] = largestRemainder([mode.threeD, mode.classic]);
  const asks = s.asks[period];
  const counts = STATS_TOPICS.map((t) => asks.topics[t]);
  const shares = largestRemainder(counts);
  const all = STATS_TOPICS.map((t, i) => ({ topic: t, n: counts[i], share: shares[i] }));
  const chips = asks.chips
    .filter((c) => topic === "all" || c.topic === topic)
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id))
    .slice(0, TOP_CHIPS);
  return {
    period,
    topic,
    visits: s.visits[period],
    pageViews: s.pageViews[period],
    countries: s.countries[period],
    topFloor: s.topFloor[period],
    mode: { threeD: mode.threeD, classic: mode.classic, threeDShare, classicShare },
    asks: {
      total: topic === "all" ? asks.total : asks.topics[topic],
      topics: topic === "all" ? all : all.filter((t) => t.topic === topic),
      chips,
    },
  };
}

export interface PerfView {
  /** Sampled 3D sessions in the period. */
  sessions: number;
  /** Share (0 to 1) of measured sessions with a median of 55 FPS or more; null without measured sessions. */
  fpsShare: number | null;
  /** Median time to explore, as a RUM bucket; null without any. */
  explore: StatsExplore | null;
}

/** The RUM perf block of one period; null when the snapshot has none or no sampled session. */
export function perfView(s: StatsSnapshotV1, period: StatsPeriod): PerfView | null {
  const p = s.perf?.[period];
  if (!p || p.sessions === 0) return null;
  return { sessions: p.sessions, fpsShare: p.measured > 0 ? p.fps55 / p.measured : null, explore: p.explore };
}
