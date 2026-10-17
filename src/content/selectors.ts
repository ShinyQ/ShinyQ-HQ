import { formatDate, formatYearMonth } from "@/lib/format";
import { isPublicLiveUrl } from "./live-links";
import type { Locale, LocalizedText, Pod, Publication, SkillGroup, Tier, TimelineEntry } from "./schema";

/** Results a case study opens with (the metric strip). Lives here, import-free, so client modules can read it. */
export const HEADLINE_MAX = 3;

/** The results a case study opens with: the ones flagged `headline`, else the first `HEADLINE_MAX`. */
export function headlineResults<T extends { headline?: boolean }>(results: readonly T[]): T[] {
  const flagged = results.filter((r) => r.headline);
  return (flagged.length > 0 ? flagged : results).slice(0, HEADLINE_MAX);
}

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

/** A pod's public live site, for every "Visit live site" surface (case study, rows, Glass Drawer, L1 Highlights Hall). */
export interface PodLiveLink {
  href: string;
  /** Host name for compact labels, e.g. "mii-microsoft.azurewebsites.net". */
  host: string;
}

/**
 * The live link of a `Pod` or a 3D `LabPod`, or null. Re-checks `PUBLIC_LIVE_HOSTS` so a stale or
 * hand-built payload can never render a link to an internal app.
 */
export function podLiveLink(pod: { liveUrl?: string }): PodLiveLink | null {
  if (!pod.liveUrl || !isPublicLiveUrl(pod.liveUrl)) return null;
  return { href: pod.liveUrl, host: new URL(pod.liveUrl).hostname };
}

const TIER_RANK: Record<Tier, number> = { hero: 0, featured: 1, listed: 2 };

/** What decides a pod's place in every project list (Page View, Cmd-K, L3 docking, Ask). */
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
/** "owner/repo" of a GitHub repository URL (`Pod.repos`). */
export function repoName(url: string): string {
  return url.replace(/^https:\/\/github\.com\//, "");
}

/** The publications a pod links (`Pod.publications`), in the pod's order; unknown ids are dropped (the schema rejects them). */
export function podPublications(pod: { publications?: readonly string[] }, publications: readonly Publication[]): Publication[] {
  return (pod.publications ?? []).flatMap((id) => publications.filter((p) => p.id === id));
}

export function researchPublications(publications: readonly Publication[]): Publication[] {
  return publications.filter((p) => isResearch(p.kind)).sort((a, b) => (b.date ?? String(b.year)).localeCompare(a.date ?? String(a.year)));
}

/**
 * Skill groups on the L1 skills wall, in column order (40 u wall, 10 u columns, appendix 01). The
 * CV has seven groups; the wall shows these four with the accents it always had (cyan, violet,
 * blue, amber), and the skills drawer, Page View and Ask list every group.
 */
export const SKILLS_WALL_GROUPS = ["backend", "ai", "azure", "devops"] as const satisfies readonly SkillGroup["id"][];

export function wallSkillGroups(groups: readonly SkillGroup[]): SkillGroup[] {
  return SKILLS_WALL_GROUPS.flatMap((id) => groups.filter((g) => g.id === id));
}

/** "Technical Consultant, Software & AI · Metrodata (...)": the current role line on the boot card and in the 3D profile card. */
export function roleLine(role: { title: LocalizedText; org: string }, locale: Locale): string {
  return `${role.title[locale]} · ${role.org}`;
}
