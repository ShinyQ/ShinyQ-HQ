/**
 * The owner's GitHub contribution calendar for the last year, as stored in
 * `content/generated/dynamic-facts.json` (`github.calendar`, written by `scripts/refresh-facts.ts`).
 * Client-safe: plain types and pure functions, no zod (the schema lives in `@/content/dynamic-facts`).
 */
export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export interface ContributionCalendar {
  /** The first day, YYYY-MM-DD (the calendar's own time zone). */
  start: string;
  /** One digit per day: GitHub's contribution level, 0 (none) to 4 (fourth quartile). */
  levels: string;
  /** One contribution count per day, same length as `levels`. */
  counts: number[];
}

export interface ContributionDay {
  date: string;
  count: number;
  level: ContributionLevel;
  /** The column on GitHub's graph, 0 for the first (often partial) week. */
  week: number;
  /** The row on GitHub's graph: 0 is Sunday. */
  weekday: number;
}

export interface ContributionStreak {
  days: number;
  start: string;
  end: string;
}

const DAY_MS = 86_400_000;

function startMs(cal: ContributionCalendar): number {
  return Date.parse(`${cal.start}T00:00:00Z`);
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Every day with its date, count, level and place on the graph (week column, weekday row). */
export function calendarDays(cal: ContributionCalendar): ContributionDay[] {
  const t0 = startMs(cal);
  const offset = new Date(t0).getUTCDay();
  return cal.counts.map((count, i) => ({
    date: isoDay(t0 + i * DAY_MS),
    count,
    level: Number(cal.levels[i]) as ContributionLevel,
    week: Math.floor((offset + i) / 7),
    weekday: (offset + i) % 7,
  }));
}

/** The number of week columns: 53 for most years, 54 when the year starts late in a week. */
export function calendarWeeks(cal: ContributionCalendar): number {
  if (cal.counts.length === 0) return 0;
  return Math.floor((new Date(startMs(cal)).getUTCDay() + cal.counts.length - 1) / 7) + 1;
}

export function calendarTotal(cal: ContributionCalendar): number {
  return cal.counts.reduce((sum, n) => sum + n, 0);
}

/** Days per level, index 0 (no contribution) to 4. */
export function levelCounts(cal: ContributionCalendar): [number, number, number, number, number] {
  const out: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const ch of cal.levels) out[Number(ch)]++;
  return out;
}

/** The day with the most contributions (the latest one on a tie), or undefined when there is none. */
export function busiestDay(cal: ContributionCalendar): ContributionDay | undefined {
  let best: ContributionDay | undefined;
  for (const day of calendarDays(cal)) if (day.count > 0 && (!best || day.count >= best.count)) best = day;
  return best;
}

/** The longest run of consecutive days with a contribution (the latest one on a tie). */
export function longestStreak(cal: ContributionCalendar): ContributionStreak | undefined {
  let best: { from: number; to: number } | undefined;
  let from = -1;
  cal.counts.forEach((count, i) => {
    if (count === 0) {
      from = -1;
      return;
    }
    if (from < 0) from = i;
    if (!best || i - from >= best.to - best.from) best = { from, to: i };
  });
  if (!best) return undefined;
  const t0 = startMs(cal);
  return { days: best.to - best.from + 1, start: isoDay(t0 + best.from * DAY_MS), end: isoDay(t0 + best.to * DAY_MS) };
}
