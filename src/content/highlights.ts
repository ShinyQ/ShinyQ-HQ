import type { HighlightsData } from "@/experience/types";
import { getPods } from "./load";
import { coverImage } from "./media";
import { pickFeaturedPods } from "./pageview";
import type { Locale, Pod, TimelineEntry } from "./schema";
import { sortTimeline } from "./selectors";

/** The top projects: the Page View landing's featured pods (the first three with a gallery, in site order). */
export function highlightProjects(pods: readonly Pod[] = getPods()): Pod[] {
  return pickFeaturedPods(pods);
}

/** Employment and freelance entries, newest first, split for the Work experience station. */
export function highlightEntries(entries: readonly TimelineEntry[]): { employment: TimelineEntry[]; freelance: TimelineEntry[] } {
  const newest = [...sortTimeline(entries)].reverse();
  return { employment: newest.filter((e) => e.type === "job"), freelance: newest.filter((e) => e.type === "freelance") };
}

/** 3D payload: the three projects with their cover thumbnail (their live links stay on `LabPod.liveUrl`). */
export function buildHighlightsData(locale: Locale): HighlightsData {
  return {
    projects: highlightProjects().map((pod) => ({
      slug: pod.slug,
      title: pod.title[locale],
      wing: pod.wing,
      // pickFeaturedPods only returns pods with a gallery, so a cover always exists.
      thumb: coverImage(pod.assets, locale)!.thumb,
    })),
  };
}
