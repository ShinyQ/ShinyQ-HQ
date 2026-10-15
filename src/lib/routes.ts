/**
 * Every locale-relative page path the static export renders. Single source
 * for the sitemap; keep in sync with the `generateStaticParams` of each route.
 */
import { getContent, getDynamicFacts, getTimeline } from "@/content/load";

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

/** Newest W3C date of the list that is not in the future (a planned end date never becomes a lastmod). */
const newest = (dates: string[], today = new Date().toISOString().slice(0, 10)) =>
  dates.filter((d) => d.slice(0, today.length) <= today).reduce<string | undefined>((a, b) => (!a || b > a ? b : a), undefined);

/**
 * `lastmod` from content dates, only where the date says when the page changed (W3C dates such as
 * "2026-10-12" or "2026-02"): a post by its date, Writing by its newest post, Journey by its newest
 * timeline date, and Home and Quick view (live facts, newest posts and roles) by the newest of the
 * weekly facts date, posts and timeline. Other pages carry no date rather than a guessed one.
 */
export function lastModified(path: string): string | undefined {
  const { floors } = getContent();
  const posts = floors.library.posts;
  const timeline = newest(getTimeline().flatMap((e) => [e.start, e.end]).filter((d) => d !== "present"));
  const writing = newest(posts.map((p) => p.date));
  if (path.startsWith("/blog/")) return posts.find((p) => `/blog/${p.slug}` === path)?.date;
  if (path === "/library") return writing;
  if (path === "/journey") return timeline;
  if (path === "/" || path === "/quick") return newest([getDynamicFacts().asOf, writing, timeline].filter((d): d is string => Boolean(d)));
  return undefined;
}
