import { formatDate, formatYearMonth } from "@/lib/format";
import type { Locale, Pod, Publication, Tier, TimelineEntry } from "./schema";

/** A pod's client as shown: the proper name, or its sector label in `locale` (C3). */
export function clientLabel(client: Pod["client"], locale: Locale): string | undefined {
  if (!client) return undefined;
  return typeof client === "string" ? client : client[locale];
}

/** Search terms for a pod's client: the name, or the sector label in every locale. */
export function clientKeywords(client: Pod["client"]): string[] {
  if (!client) return [];
  return typeof client === "string" ? [client] : [client.en, client.id];
}

const TIER_RANK: Record<Tier, number> = { hero: 0, featured: 1, listed: 2 };

/** What decides a pod's place in every project list (Page View, Cmd-K, L3 docking, the tour, Ask). */
export interface PodRank {
  tier: Tier;
  order: number;
  hasGallery: boolean;
}

/** A pod has a gallery when it ships at least one reviewed screenshot (`assets[0]` is its cover). */
export function podHasGallery(pod: Pick<Pod, "assets">): boolean {
  return pod.assets.length > 0;
}

/**
 * Site order for projects (owner decision 2026-10-12): pods with a gallery first, then hero before
 * featured before listed, then `order`. Ties keep their input order (Array.prototype.sort is stable).
 */
export function comparePods(a: PodRank, b: PodRank): number {
  return Number(b.hasGallery) - Number(a.hasGallery) || TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.order - b.order;
}

const podRank = (pod: Pod): PodRank => ({ tier: pod.tier, order: pod.order, hasGallery: podHasGallery(pod) });

/** Pods in site order (`comparePods`); the one selector behind every project list. */
export function orderPods(pods: readonly Pod[]): Pod[] {
  return [...pods].sort((a, b) => comparePods(podRank(a), podRank(b)));
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
