/**
 * Every locale-relative page path the static export renders. Single source
 * for the sitemap; keep in sync with the `generateStaticParams` of each route.
 */
import { getContent } from "@/content/load";

export const STATIC_PATHS = ["/", "/quick", "/journey", "/labs", "/library", "/contact", "/cv"] as const;

export function allPagePaths(): string[] {
  const { floors } = getContent();
  return [
    ...STATIC_PATHS,
    ...floors.careerArchive.entries.map((e) => `/journey/${e.slug}`),
    ...floors.labs.pods.map((p) => `/labs/${p.slug}`),
    ...floors.library.posts.filter((p) => !p.url).map((p) => `/blog/${p.slug}`),
  ];
}
