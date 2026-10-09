import { formatDate, formatYearMonth } from "@/lib/format";
import type { Locale, Pod, Publication, Tier, TimelineEntry } from "./schema";

const TIER_RANK: Record<Tier, number> = { hero: 0, featured: 1, listed: 2 };

/** Spec appendix 01 section 4: hero first, then by `order`. */
export function sortPods(pods: readonly Pod[]): Pod[] {
  return [...pods].sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.order - b.order);
}

/** Oldest first; ties broken by end date then id for stable output. */
export function sortTimeline(entries: readonly TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.start.localeCompare(b.start) ||
      (a.end === "present" ? "9999" : a.end).localeCompare(b.end === "present" ? "9999" : b.end) ||
      a.id.localeCompare(b.id),
  );
}

export const FIRST_CORRIDOR_YEAR = 2019;

export interface YearGroup {
  year: number;
  entries: TimelineEntry[];
}

/**
 * Groups entries into year rooms by start year. Entries before 2019 fold into
 * the 2019 gate as the "prologue" (spec appendix 07 section 3).
 */
export function groupEntriesByYear(entries: readonly TimelineEntry[]): YearGroup[] {
  const groups = new Map<number, TimelineEntry[]>();
  for (const entry of sortTimeline(entries)) {
    const year = Math.max(FIRST_CORRIDOR_YEAR, Number(entry.start.slice(0, 4)));
    groups.set(year, [...(groups.get(year) ?? []), entry]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([year, list]) => ({ year, entries: list }));
}

export function adjacent<T>(list: readonly T[], index: number): { prev?: T; next?: T } {
  return { prev: index > 0 ? list[index - 1] : undefined, next: index < list.length - 1 ? list[index + 1] : undefined };
}

/** Papers and the thesis go on the Research shelf; models and datasets stay on the models shelf. */
export function isResearch(kind: string): boolean {
  return kind === "paper" || kind === "thesis";
}

/** Localized date of a publication: full date, month or year. */
export function publicationDate(p: Publication, locale: Locale): string {
  if (!p.date) return String(p.year);
  return p.date.length === 10 ? formatDate(p.date, locale) : formatYearMonth(p.date, locale);
}

/** Papers and the thesis, newest first. */
export function researchPublications(publications: readonly Publication[]): Publication[] {
  return publications.filter((p) => isResearch(p.kind)).sort((a, b) => (b.date ?? String(b.year)).localeCompare(a.date ?? String(a.year)));
}
