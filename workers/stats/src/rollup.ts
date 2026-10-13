import { floorOfPath } from "../../../src/lib/stats/floors";
import { isCountryCode, STATS_FLOORS, STATS_MAX_CHIPS, STATS_TOPICS, type StatsAsks, type StatsFloor, type StatsSnapshotV1, type StatsTopic } from "../../../src/lib/stats/protocol";
import type { AeRows, DayRollup, WaRows } from "./types";

/** Pure rollup and snapshot math of the hq-stats Worker (no I/O, unit tested in node). */

const DAY_MS = 86_400_000;

/** `day` (YYYY-MM-DD, UTC) moved by `n` days. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Every UTC day from `from` to `to`, both included; empty when `from` is later. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Abuse cross-check: a day whose beacon points exceed `max(floor, factor x Web Analytics page views)`
 * keeps a zero split (`frozen`). Page views count SPA navigations, so real traffic stays well below.
 */
export const MODE_FREEZE = { factor: 3, floor: 30 };

const clean = (v: number): number => (Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
const isTopic = (v: string): v is StatsTopic => (STATS_TOPICS as readonly string[]).includes(v);

function add<K extends string>(map: Partial<Record<K, number>>, key: K, n: number) {
  if (n > 0) map[key] = (map[key] ?? 0) + n;
}

export function buildRollups(dates: readonly string[], wa: WaRows, ae: AeRows, chipTopics: ReadonlyMap<string, StatsTopic>): DayRollup[] {
  return dates.map((date) => {
    let visits = 0;
    let pageViews = 0;
    for (const r of wa.days) {
      if (r.date !== date) continue;
      visits += clean(r.visits);
      pageViews += clean(r.count);
    }

    const countries = new Set<string>();
    for (const r of wa.countries) if (r.date === date && isCountryCode(r.country) && (clean(r.count) > 0 || clean(r.visits) > 0)) countries.add(r.country);

    const floors: Partial<Record<StatsFloor, number>> = {};
    for (const r of wa.paths) {
      if (r.date !== date) continue;
      const floor = floorOfPath(r.path);
      if (floor) add(floors, floor, clean(r.count));
    }

    let threeD = 0;
    let classic = 0;
    let points = 0;
    for (const r of ae.visits) {
      if (r.day !== date) continue;
      const n = clean(r.n);
      if (r.mode === "3d") threeD += n;
      else if (r.mode === "classic") classic += n;
      else if (r.mode === "both") {
        threeD += n;
        classic += n;
      } else continue;
      points += n;
    }
    const frozen = points > Math.max(MODE_FREEZE.floor, MODE_FREEZE.factor * pageViews);

    const asks: DayRollup["asks"] = { total: 0, topics: {}, chips: {} };
    for (const r of ae.asks) {
      if (r.day !== date) continue;
      const n = clean(r.n);
      asks.total += n;
      if (isTopic(r.topic)) add(asks.topics, r.topic, n);
      if (chipTopics.has(r.chip) && n > 0) asks.chips[r.chip] = (asks.chips[r.chip] ?? 0) + n;
    }

    return { date, visits, pageViews, countries: [...countries].sort(), floors, mode: frozen ? { threeD: 0, classic: 0, frozen: true } : { threeD, classic }, asks };
  });
}

const isEmpty = (d: DayRollup) => d.visits === 0 && d.pageViews === 0 && d.countries.length === 0 && d.asks.total === 0 && d.mode.threeD === 0 && d.mode.classic === 0;

/** Drops the empty days before the first day with any data (the first backfill), so `since` is the real launch. */
export function trimLeadingEmpty(days: readonly DayRollup[]): DayRollup[] {
  const first = days.findIndex((d) => !isEmpty(d));
  return first === -1 ? [] : days.slice(first);
}

interface Period {
  visits: number;
  pageViews: number;
  countries: string[];
  topFloor: StatsFloor | null;
  mode: { threeD: number; classic: number };
  asks: StatsAsks;
}

function aggregate(days: readonly DayRollup[], chipTopics: ReadonlyMap<string, StatsTopic>): Period {
  let visits = 0;
  let pageViews = 0;
  const countries = new Set<string>();
  const floors: Partial<Record<StatsFloor, number>> = {};
  const mode = { threeD: 0, classic: 0 };
  const topics = Object.fromEntries(STATS_TOPICS.map((t) => [t, 0])) as Record<StatsTopic, number>;
  const chips = new Map<string, number>();
  let total = 0;
  for (const d of days) {
    visits += d.visits;
    pageViews += d.pageViews;
    d.countries.forEach((c) => countries.add(c));
    for (const f of STATS_FLOORS) add(floors, f, d.floors[f] ?? 0);
    mode.threeD += d.mode.threeD;
    mode.classic += d.mode.classic;
    total += d.asks.total;
    for (const t of STATS_TOPICS) topics[t] += d.asks.topics[t] ?? 0;
    for (const [id, n] of Object.entries(d.asks.chips)) if (chipTopics.has(id)) chips.set(id, (chips.get(id) ?? 0) + n);
  }
  let topFloor: StatsFloor | null = null;
  for (const f of STATS_FLOORS) if ((floors[f] ?? 0) > (topFloor ? (floors[topFloor] ?? 0) : 0)) topFloor = f;
  const chipList = [...chips]
    .map(([id, n]) => ({ id, topic: chipTopics.get(id) as StatsTopic, n }))
    .sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, STATS_MAX_CHIPS);
  return { visits, pageViews, countries: [...countries].sort(), topFloor, mode, asks: { total, topics, chips: chipList } };
}

/**
 * The public snapshot over the ledger up to `lastDay` (the last complete UTC day): `d30` is the 30 days
 * ending on `lastDay`, `all` every day since the first rollup. Null for an empty ledger.
 */
export function buildSnapshot(days: readonly DayRollup[], lastDay: string, chipTopics: ReadonlyMap<string, StatsTopic>): StatsSnapshotV1 | null {
  const upTo = days.filter((d) => d.date <= lastDay);
  if (!upTo.length) return null;
  const start = addDays(lastDay, -29);
  const d30 = aggregate(
    upTo.filter((d) => d.date >= start),
    chipTopics,
  );
  const all = aggregate(upTo, chipTopics);
  return {
    v: 1,
    updatedAt: `${addDays(lastDay, 1)}T00:00:00.000Z`,
    since: upTo[0].date,
    sampled: true,
    visits: { d30: d30.visits, all: all.visits },
    pageViews: { d30: d30.pageViews, all: all.pageViews },
    countries: { d30: d30.countries, all: all.countries },
    topFloor: { d30: d30.topFloor, all: all.topFloor },
    mode: { d30: d30.mode, all: all.mode },
    asks: { d30: d30.asks, all: all.asks },
  };
}
