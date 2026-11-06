/**
 * Every locale-relative page path the static export renders. Single source
 * for the sitemap; keep in sync with the `generateStaticParams` of each route.
 */
import { postUpdated } from "@/content/blog";
import { getBuildFacts } from "@/content/build-story";
import { stampedDate } from "@/content/lastmod";
import { getContent, getDynamicFacts, getTimeline } from "@/content/load";
import { LOCALES } from "@/content/locales";
import type { Locale } from "@/content/schema";

export const STATIC_PATHS = ["/", "/quick", "/journey", "/labs", "/library", "/contact", "/cv", "/build"] as const;

export function allPagePaths(): string[] {
  const { floors } = getContent();
  return [
    ...STATIC_PATHS,
    ...floors.careerArchive.entries.map((e) => `/journey/${e.slug}`),
    ...floors.labs.pods.map((p) => `/labs/${p.slug}`),
    ...floors.library.posts.filter((p) => !p.url).map((p) => `/blog/${p.slug}`),
  ];
}

const hostedPost = (path: string) => {
  const slug = /^\/blog\/([^/]+)$/.exec(path)?.[1];
  return slug ? getContent().floors.library.posts.find((p) => p.slug === slug && !p.url) : undefined;
};

/**
 * The locales a page's content is written in: every locale, except for a hosted post written in fewer languages
 * (`PostRef.languages`). The other locale still renders that post with a note (the translation fallback), but its
 * canonical and og:url point at the original, and it gets no hreflang pair and no sitemap entry.
 */
export function pathLocales(path: string): Locale[] {
  const post = hostedPost(path);
  return post ? LOCALES.filter((l) => post.languages.includes(l)) : [...LOCALES];
}

/** Newest W3C date of the list that is not in the future (a planned end date never becomes a lastmod). */
const newest = (dates: (string | undefined)[], today = new Date().toISOString().slice(0, 10)) =>
  dates
    .filter((d): d is string => Boolean(d))
    .filter((d) => d.slice(0, today.length) <= today)
    .reduce<string | undefined>((a, b) => (!a || b > a ? b : a), undefined);

/**
 * A sitemap `<lastmod>`: the day (`YYYY-MM-DD`) of a full date or date-time. A month-only date ("2026-10") gives none:
 * Google Search Console reads it as an invalid date, and a guessed day would claim a change that never happened.
 */
export function sitemapDate(date: string | undefined): string | undefined {
  return date && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(date) ? date.slice(0, 10) : undefined;
}

/**
 * `lastmod` from content dates, only where the date says when the page changed (W3C dates such as
 * "2026-10-12" or "2026-02"): a post by its date or, when that translation was revised, its frontmatter `updated`
 * (`postUpdated`, of the translation `locale` renders; without a locale the newest of its languages), Writing by its
 * newest post, Journey by its content stamp (else its newest timeline date), Home and Quick view (live facts, newest
 * posts, roles, case studies) by the newest of the weekly facts date, posts, timeline and the Labs and Journey stamps,
 * the build story by its facts snapshot (the
 * HEAD commit date), and case studies, journey entries, Labs and the CV by their content stamp (`stampedDate`: the
 * day of the commit that last changed their content). Other pages carry no date rather than a guessed one.
 */
export function lastModified(path: string, locale?: Locale): string | undefined {
  const { floors } = getContent();
  const posts = floors.library.posts;
  const timeline = newest(getTimeline().flatMap((e) => [e.start, e.end]).filter((d) => d !== "present"));
  const writing = newest(posts.map((p) => p.date));
  if (path.startsWith("/blog/")) {
    const post = hostedPost(path);
    if (!post) return posts.find((p) => `/blog/${p.slug}` === path)?.date;
    return newest([post.date, ...(locale ? [locale] : post.languages).map((l) => postUpdated(post, l))]);
  }
  if (path === "/library") return writing;
  if (path === "/journey") return stampedDate(path) ?? timeline;
  if (path === "/build") return getBuildFacts().generatedAt;
  if (path === "/" || path === "/quick") return newest([getDynamicFacts().asOf, writing, timeline, stampedDate("/labs"), stampedDate("/journey")]);
  return stampedDate(path);
}
