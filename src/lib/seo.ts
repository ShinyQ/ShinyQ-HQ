/**
 * Search and share copy for every page (owner request 2026-10-13: "fix the wording for the SEO").
 * Titles lead with the owner's name and value; descriptions are outcome-focused and 140 to 160
 * characters, built from content (taglines, key results, stack, excerpts, career summaries) and the
 * `seo` messages. Facts come from content/site-content.json, never from this file.
 */
import { createTranslator } from "next-intl";
import { getContent, getPod, getPost, getProfile, getTimeline, getTimelineEntry } from "@/content/load";
import type { Locale, Pod, PostRef, Result, TimelineEntry } from "@/content/schema";
import { hasFirstPerson } from "@/lib/first-person";
import type { Metadata } from "next";
import { type OgPage, type OgTarget, ogImagePath, pageMetadata } from "@/lib/site";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

export const TITLE_MAX = 60;
export const HOME_TITLE_MAX = 95;
export const DYNAMIC_TITLE_MAX = 100;
/** `<title>` budget: search results cut titles at about 600 px, roughly 60 characters. */
export const SEARCH_TITLE_MAX = 60;
export const DESCRIPTION_MIN = 140;
export const DESCRIPTION_MAX = 160;
/** Journey entry titles add the organization only while they stay this short. */
const ENTRY_TITLE_WITH_ORG_MAX = 70;

const MESSAGES = { en, id } as const;
const seoT = (locale: Locale) => createTranslator({ locale, messages: MESSAGES[locale], namespace: "seo" });

/** The result a card or description leads with: the first numeric result whose label is not first person. */
export function keyResult(pod: Pick<Pod, "results">): Result {
  const clean = pod.results.filter((r) => !hasFirstPerson(r.label.en, "en") && !hasFirstPerson(r.label.id, "id"));
  const pool = clean.length > 0 ? clean : pod.results;
  return pool.find((r) => /\d/.test(r.value)) ?? pool[0];
}

/** First and last year on the career timeline, e.g. { from: "2016", to: "2026" }. */
export function journeyYears(): { from: string; to: string } {
  const years = getTimeline()
    .flatMap((e) => [e.start, e.end])
    .filter((v) => v !== "present")
    .map((v) => Number(v.slice(0, 4)));
  return { from: String(Math.min(...years)), to: String(Math.max(...years)) };
}

/** "Caller interruption latency" -> "caller interruption latency"; acronyms ("AI triage") stay. */
export function lowerFirst(text: string): string {
  return /^[A-Z][A-Z]/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

export function withStop(text: string): string {
  const t = text.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/** Fits a lead into `max` characters: whole sentences first, then a clause, then words with an ellipsis. */
export function shortenLead(text: string, max = DESCRIPTION_MAX): string {
  const t = withStop(text);
  if (t.length <= max) return t;
  let out = "";
  for (const sentence of t.split(/(?<=[.!?])\s+/)) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > max) break;
    out = next;
  }
  if (out.length >= 60) return out;
  const cut = t.slice(0, max - 1);
  for (const separator of ["; ", ": ", ", "]) {
    const i = cut.lastIndexOf(separator);
    if (i >= 60) return `${cut.slice(0, i)}.`;
  }
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]+$/, "")}…`;
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * The lead plus at most one option per group, within [min, max] characters. Prefers including
 * earlier groups, then earlier options in a group. Falls back to the longest text within `max`.
 */
export function fitDescription(lead: string, groups: readonly (readonly string[])[], min = DESCRIPTION_MIN, max = DESCRIPTION_MAX): string {
  const base = shortenLead(lead, max);
  let best: { text: string; key: number[] } | undefined;
  let longest = base;
  const walk = (i: number, parts: string[], included: number[], picks: number[]) => {
    if (i === groups.length) {
      const text = [base, ...parts].join(" ");
      if (text.length > max) return;
      if (text.length > longest.length) longest = text;
      const key = [...included, ...picks.map((j) => -j)];
      if (text.length >= min && (!best || compareKeys(key, best.key) > 0)) best = { text, key };
      return;
    }
    walk(i + 1, parts, [...included, 0], [...picks, 0]);
    groups[i].forEach((option, j) => walk(i + 1, [...parts, option], [...included, 1], [...picks, j]));
  };
  walk(0, [], [], []);
  return best?.text ?? longest;
}

/** "2022 to 2023", "2026 hingga sekarang", or one year when start and end share it. */
export function periodLabel(start: string, end: string, locale: Locale): string {
  const t = seoT(locale);
  const from = start.slice(0, 4);
  if (end !== "present" && end.slice(0, 4) === from) return from;
  return t("period", { from, to: end === "present" ? t("present") : end.slice(0, 4) });
}

/** The first candidate within `max` characters, else the shortest one. */
export function fitTitle(candidates: readonly string[], max = SEARCH_TITLE_MAX): string {
  return candidates.find((c) => c.length <= max) ?? [...candidates].sort((a, b) => a.length - b.length)[0];
}

export interface SeoPage {
  /** Share copy: Open Graph and Twitter title, OG card alt text, structured data. */
  title: string;
  /** `<title>`: the share title when it fits SEARCH_TITLE_MAX, else a shorter attribution (`fitTitle`). */
  searchTitle: string;
  description: string;
  image: OgTarget;
  imageAlt: string;
  type: "website" | "article";
  publishedTime?: string;
  tags?: string[];
}

const SECTION_PAGES: Record<string, OgPage> = {
  "/quick": "quick",
  "/journey": "journey",
  "/labs": "labs",
  "/library": "library",
  "/contact": "contact",
  "/cv": "cv",
  "/build": "build",
};

/** "Kurniadi Ahmad Wijaya" -> "Kurniadi": the short attribution in search titles. */
function firstName(name: string): string {
  return name.split(" ")[0];
}

function podSeo(pod: Pod, locale: Locale, name: string): SeoPage {
  const t = seoT(locale);
  const result = keyResult(pod);
  const title = t("podTitle", { title: pod.title[locale], name });
  const searchTitle = fitTitle([title, t("podTitle", { title: pod.title[locale], name: firstName(name) }), pod.title[locale]]);
  const description = fitDescription(pod.tagline[locale], [
    [t("keyResult", { value: result.value, label: lowerFirst(result.label[locale]) })],
    [3, 2, 1].filter((k) => pod.stack.length >= k).map((k) => t("builtWith", { stack: pod.stack.slice(0, k).join(", ") })),
    [t("caseStudyBy", { name }), t("byName", { name })],
  ]);
  return { title, searchTitle, description, image: { kind: "labs", locale, slug: pod.slug }, imageAlt: title, type: "article", tags: pod.stack };
}

function postSeo(post: PostRef, locale: Locale, name: string, role: string): SeoPage {
  const t = seoT(locale);
  const title = t("postTitle", { title: post.title[locale], name });
  const searchTitle = fitTitle([title, t("postTitle", { title: post.title[locale], name: firstName(name) }), post.title[locale]]);
  const description = fitDescription(post.excerpt[locale], [[t("postBy", { name, role }), t("articleBy", { name }), t("byName", { name })], [t("readArticle")]]);
  return { title, searchTitle, description, image: { kind: "blog", locale, slug: post.slug }, imageAlt: title, type: "article", publishedTime: post.date, tags: post.tags };
}

function entrySeo(entry: TimelineEntry, locale: Locale, name: string): SeoPage {
  const t = seoT(locale);
  const role = entry.role[locale];
  const period = periodLabel(entry.start, entry.end, locale);
  const bareOrg = (value: string) => value.replace(/\s*\([^)]*\)/g, "").trim();
  const org = bareOrg(entry.org);
  // Entries that share a role and organization (yearly trophy cases, side projects) are told apart by their period.
  const shared = getTimeline().some((e) => e.slug !== entry.slug && e.role[locale] === role && bareOrg(e.org) === org);
  const dated = (text: string) => (shared ? `${text} (${period})` : text);
  const withOrg = dated(t("entryTitleOrg", { name, role, org }));
  const title = withOrg.length <= ENTRY_TITLE_WITH_ORG_MAX ? withOrg : dated(t("entryTitle", { name, role }));
  const short = firstName(name);
  // The organization keeps two entries with the same role apart, so it goes before the full name.
  const searchTitle = fitTitle([
    withOrg,
    dated(t("entryTitleOrg", { name: short, role, org })),
    dated(t("entryTitle", { name, role })),
    dated(t("entryTitle", { name: short, role })),
    dated(role),
  ]);
  const description = fitDescription(entry.summary[locale], [
    [t("entryRole", { role, org: entry.org, period }), t("entryOrg", { org: entry.org, period }), t("entryPeriod", { period })],
    [t("careerOf", { name }), t("byName", { name })],
    [t("seeJourney")],
  ]);
  return { title, searchTitle, description, image: { kind: "page", locale, page: "journey" }, imageAlt: title, type: "website" };
}

type DescribedPage = keyof (typeof en)["seo"]["more"];

/** A page's lead sentence plus the longest closing line from `seo.more.<page>` that keeps it within 140 to 160 characters. */
function pageDescription(locale: Locale, page: DescribedPage, values: Record<string, string>): string {
  const t = seoT(locale);
  const tails = Object.keys(MESSAGES[locale].seo.more[page]).map((k) => t(`more.${page}.${k}` as Parameters<typeof t>[0], values));
  return fitDescription(t(`${page}Description`, values), [tails]);
}

/** Title, description and share card of a locale-relative page path from `allPagePaths()`. */
export function seoFor(locale: Locale, path: string): SeoPage {
  const t = seoT(locale);
  const profile = getProfile();
  const name = profile.name;
  const values = {
    name,
    role: profile.headline[locale],
    city: profile.location[locale].split(",")[0].trim(),
    motto: profile.subheadline[locale],
    count: String(getContent().floors.labs.pods.length),
    ...journeyYears(),
  };
  if (path === "/") {
    const title = t("homeTitle", values);
    const searchTitle = fitTitle([title, t("homeSearchTitle", values)]);
    return { title, searchTitle, description: pageDescription(locale, "home", values), image: { kind: "default", locale }, imageAlt: title, type: "website" };
  }
  const page = SECTION_PAGES[path];
  if (page) {
    const title = t(`${page}Title`, values);
    return { title, searchTitle: title, description: pageDescription(locale, page, values), image: { kind: "page", locale, page }, imageAlt: title, type: "website" };
  }
  const [, section, slug] = path.split("/");
  if (section === "labs") {
    const pod = getPod(slug);
    if (pod) return podSeo(pod, locale, name);
  }
  if (section === "blog") {
    const post = getPost(slug);
    if (post && !post.url) return postSeo(post, locale, name, values.role);
  }
  if (section === "journey") {
    const entry = getTimelineEntry(slug);
    if (entry) return entrySeo(entry, locale, name);
  }
  throw new Error(`No search metadata for ${path}`);
}

/** Next metadata for a page: always use this in `generateMetadata` (canonical, hreflang, Open Graph, Twitter). */
export function seoMetadata(locale: Locale, path: string): Metadata {
  const seo = seoFor(locale, path);
  return pageMetadata({
    locale,
    path,
    title: seo.title,
    documentTitle: seo.searchTitle,
    description: seo.description,
    type: seo.type,
    publishedTime: seo.publishedTime,
    tags: seo.tags,
    image: ogImagePath(seo.image),
    imageAlt: seo.imageAlt,
  });
}
