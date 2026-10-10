import type { Pod, TimelineEntry } from "./schema";

/**
 * Pure helpers for the Page View filters and nav. Client-safe: type-only imports, so the
 * filter islands never bundle zod or the dataset.
 */

export type Wing = Pod["wing"];
export type EntryType = TimelineEntry["type"];

export const WINGS: readonly Wing[] = ["ai", "software"];
export const ENTRY_TYPES: readonly EntryType[] = ["job", "freelance", "education", "award", "milestone"];

export interface PodFilter {
  wing: Wing | "all";
  stack: string | null;
}

export const NO_POD_FILTER: PodFilter = { wing: "all", stack: null };

export function parsePodFilter(search: string): PodFilter {
  const params = new URLSearchParams(search);
  const wing = params.get("wing");
  const stack = params.get("stack");
  return {
    wing: WINGS.includes(wing as Wing) ? (wing as Wing) : "all",
    stack: stack ? stack : null,
  };
}

export function podFilterQuery(filter: PodFilter): string {
  const params = new URLSearchParams();
  if (filter.wing !== "all") params.set("wing", filter.wing);
  if (filter.stack) params.set("stack", filter.stack);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function matchesPod(pod: Pick<Pod, "wing" | "stack">, filter: PodFilter): boolean {
  if (filter.wing !== "all" && pod.wing !== filter.wing) return false;
  return !filter.stack || pod.stack.includes(filter.stack);
}

/** Stack names used by at least `min` pods, most used first, then alphabetical. */
export function stackOptions(pods: readonly Pick<Pod, "stack">[], min = 1): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const pod of pods) for (const name of new Set(pod.stack)) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts]
    .filter(([, count]) => count >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

export function wingCounts(pods: readonly Pick<Pod, "wing">[]): Record<"all" | Wing, number> {
  const counts = { all: pods.length, ai: 0, software: 0 };
  for (const pod of pods) counts[pod.wing] += 1;
  return counts;
}

export function parseTypeFilter(search: string): EntryType | "all" {
  const type = new URLSearchParams(search).get("type");
  return ENTRY_TYPES.includes(type as EntryType) ? (type as EntryType) : "all";
}

export function typeCounts(entries: readonly Pick<TimelineEntry, "type">[]): Record<"all" | EntryType, number> {
  const counts: Record<"all" | EntryType, number> = { all: entries.length, job: 0, freelance: 0, education: 0, award: 0, milestone: 0 };
  for (const entry of entries) counts[entry.type] += 1;
  return counts;
}

/** Sections whose child routes live under another prefix (posts belong to Writing). */
const ALIASES: Record<string, readonly string[]> = { "/library": ["/blog"] };

/** True when a locale-less pathname is the nav section `href` or one of its children. */
export function navMatch(pathname: string, href: string): boolean {
  return [href, ...(ALIASES[href] ?? [])].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
