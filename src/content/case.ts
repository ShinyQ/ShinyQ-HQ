import type { Pod } from "./schema";
import { headlineResults } from "./selectors";

/** Case study chapters, in page order; the ids are the anchors (3D drawer tabs, missions and old links use them). */
export type ChapterId = "problem" | "approach" | "results" | "lesson" | "architecture" | "engineering" | "gallery" | "code" | "stack";

/**
 * The 8 chapters every key project shows, like `/labs/voice-ai-contact-center` (owner decision 2026-11-13): Situation,
 * Role and key decisions, Results, Lesson, Architecture, Engineering details, Gallery, Tech stack. "Code and research"
 * (`code`) may sit before Tech stack when a pod has repositories or publications.
 */
export const KEY_PROJECT_CHAPTERS: readonly ChapterId[] = ["problem", "approach", "results", "lesson", "architecture", "engineering", "gallery", "stack"];

type ChapterPod = Pick<Pod, "story" | "results" | "architecture" | "engineering" | "assets" | "repos" | "publications">;

/** The full results chapter only when it adds something to the strip: more results, or how they were measured. */
export function hasResultsChapter(pod: Pick<Pod, "results">): boolean {
  return pod.results.length > headlineResults(pod.results).length || pod.results.some((r) => r.context);
}

/** A case study's chapters in page order: the story order with a `story`, else Results (when it adds something), Problem, Contribution. */
export function caseChapters(pod: ChapterPod): ChapterId[] {
  const tail: ChapterId[] = [
    ...(pod.architecture ? (["architecture"] as const) : []),
    ...(pod.engineering ? (["engineering"] as const) : []),
    ...(pod.assets.length > 0 ? (["gallery"] as const) : []),
    ...(pod.repos?.length || pod.publications?.length ? (["code"] as const) : []),
    "stack",
  ];
  if (pod.story) return ["problem", "approach", "results", ...(pod.story.lesson ? (["lesson"] as const) : []), ...tail];
  return [...(hasResultsChapter(pod) ? (["results"] as const) : []), "problem", "approach", ...tail];
}
