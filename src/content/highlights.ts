import type { HighlightsData } from "@/experience/types";
import { formatPeriod } from "@/lib/format";
import { getAwards, getPods, getTimeline } from "./load";
import { coverImage } from "./media";
import { pickFeaturedPods } from "./pageview";
import type { Award, Locale, Pod, TimelineEntry } from "./schema";
import { sortTimeline } from "./selectors";

/** Placement tiers on the wins station, in order: 1st, 2nd and 3rd place, then every other placing (finalists and honors). */
export const WIN_TIERS = ["gold", "silver", "bronze", "honor"] as const;
export type WinTier = (typeof WIN_TIERS)[number];

/** An award's tier from its English placement: 1st, 2nd and 3rd place have their own tiers, every other placing is an honor. */
export function winTier(placementEn: string): WinTier {
  const m = /^(1st|2nd|3rd) place$/i.exec(placementEn.trim());
  if (!m) return "honor";
  return m[1].toLowerCase() === "1st" ? "gold" : m[1].toLowerCase() === "2nd" ? "silver" : "bronze";
}

/** Awards by tier (gold, silver, bronze, honor), each tier newest first, ties by title. */
export function winTiers<A extends Pick<Award, "placement" | "date" | "title">>(awards: readonly A[]): { tier: WinTier; awards: A[] }[] {
  return WIN_TIERS.map((tier) => ({
    tier,
    awards: awards.filter((a) => winTier(a.placement.en) === tier).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title)),
  }));
}

/** The wins station's numbers: every placing, and the wins (first places). */
export function winCounts(awards: readonly Pick<Award, "placement">[]): { placings: number; firsts: number } {
  return { placings: awards.length, firsts: awards.filter((a) => winTier(a.placement.en) === "gold").length };
}

/**
 * A result that reads as a before and after: "90.9% to 36.4%", "11.7 MB → 156 KB". Side-by-side comparisons ("6 vs 18")
 * and single numbers are not.
 */
const BEFORE_AFTER = /→|\sto\s/;

/**
 * The results station (owner decision 2026-11-02): only verified results (`confidence: "verified"`, never shown itself)
 * whose value is a before and after, from the case studies in site order (`getPods`), each with its case study.
 */
export function beforeAfterResults(pods: readonly Pod[] = getPods()): { pod: Pod; result: Pod["results"][number] }[] {
  return pods.flatMap((pod) => pod.results.filter((r) => r.confidence === "verified" && BEFORE_AFTER.test(r.value)).map((result) => ({ pod, result })));
}

/** The now station: the roles still running (no end date), employment first, then freelance, newest first. */
export function currentRoles(entries: readonly TimelineEntry[] = getTimeline()): TimelineEntry[] {
  const newest = [...sortTimeline(entries)].reverse().filter((e) => e.end === "present" && (e.type === "job" || e.type === "freelance"));
  return [...newest.filter((e) => e.type === "job"), ...newest.filter((e) => e.type === "freelance")];
}

/** The top projects: the Page View landing's featured pods (the first three with a gallery, in site order). */
export function highlightProjects(pods: readonly Pod[] = getPods()): Pod[] {
  return pickFeaturedPods(pods);
}

/** Employment and freelance entries, newest first, split for the Work experience station. */
export function highlightEntries(entries: readonly TimelineEntry[]): { employment: TimelineEntry[]; freelance: TimelineEntry[] } {
  const newest = [...sortTimeline(entries)].reverse();
  return { employment: newest.filter((e) => e.type === "job"), freelance: newest.filter((e) => e.type === "freelance") };
}

/** 3D payload: the three projects with their cover thumbnail (their live links stay on `LabPod.liveUrl`), the wins counts, the results and the current roles. */
export function buildHighlightsData(locale: Locale): HighlightsData {
  const awards = getAwards();
  return {
    wins: { ...winCounts(awards), tiers: winTiers(awards).map(({ tier, awards: list }) => ({ tier, count: list.length })) },
    results: beforeAfterResults().map(({ pod, result }) => ({ slug: pod.slug, project: pod.title[locale], value: result.value, label: result.label[locale] })),
    now: currentRoles().map((e) => ({ slug: e.slug, org: e.org, role: e.role[locale], type: e.type as "job" | "freelance", period: formatPeriod(e.start, e.end, locale) })),
    projects: highlightProjects().map((pod) => ({
      slug: pod.slug,
      title: pod.title[locale],
      wing: pod.wing,
      // pickFeaturedPods only returns pods with a gallery, so a cover always exists.
      thumb: coverImage(pod.assets, locale)!.thumb,
    })),
  };
}

/** Units a result side may carry, with the dimension it measures and its factor to the dimension's base unit. */
const RESULT_UNIT: Record<string, { dim: string; factor: number }> = {
  "%": { dim: "pct", factor: 1 },
  ms: { dim: "time", factor: 0.001 },
  s: { dim: "time", factor: 1 },
  B: { dim: "size", factor: 0.001 },
  KB: { dim: "size", factor: 1 },
  MB: { dim: "size", factor: 1000 },
};

function resultSide(raw: string): { value: number; dim: string } | null {
  const m = raw.trim().match(/^[~<>]?\s*([\d.,]+)\s*(%|ms|s|B|KB|MB)?$/);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const unit = RESULT_UNIT[m[2] ?? ""] ?? { dim: "count", factor: 1 };
  return { value: value * unit.factor, dim: unit.dim };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * A result's before and after as two comparable numbers (the hall's results bars, owner decision 2026-11-04), in the
 * dimension's base unit; `log` when one side is over 20 times the other. Null when the value does not split into two
 * sides of the same dimension, or both are zero: the station shows that result as text only.
 */
export type ResultBar = { before: number; after: number; scale: "linear" | "log" } | null;

export function resultBars(value: string): ResultBar {
  const parts = value.split(/\s*(?:→|\bto\b)\s*/);
  if (parts.length !== 2) return null;
  const [a, b] = parts.map(resultSide);
  if (!a || !b || a.dim !== b.dim || Math.max(a.value, b.value) <= 0) return null;
  const low = Math.min(a.value, b.value);
  const ratio = low > 0 ? Math.max(a.value, b.value) / low : 1;
  return { before: round3(a.value), after: round3(b.value), scale: ratio > 20 ? "log" : "linear" };
}

/** One orbiting token of the wins station: gold in the inner ring and larger, silver and bronze in the middle, honors outside and small. */
export type WinToken = { tier: WinTier; ring: 0 | 1 | 2; angle: number; size: number };

const TOKEN_RING: Record<WinTier, { ring: 0 | 1 | 2; size: number }> = {
  gold: { ring: 0, size: 1.4 },
  silver: { ring: 1, size: 1 },
  bronze: { ring: 1, size: 1 },
  honor: { ring: 2, size: 0.6 },
};

/** One token per award and honor (`winTiers` counts), spread evenly around its ring; tiers sharing a ring interleave by angle offset. */
export function winTokens(tiers: readonly { tier: WinTier; count: number }[]): WinToken[] {
  const perRing = [0, 0, 0];
  for (const t of tiers) perRing[TOKEN_RING[t.tier].ring] += t.count;
  const placed = [0, 0, 0];
  return tiers.flatMap((t) =>
    Array.from({ length: t.count }, () => {
      const { ring, size } = TOKEN_RING[t.tier];
      const angle = (placed[ring]++ / Math.max(perRing[ring], 1)) * Math.PI * 2 + ring * 0.4;
      return { tier: t.tier, ring, angle, size };
    }),
  );
}
