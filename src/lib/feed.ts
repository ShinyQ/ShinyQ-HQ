/**
 * Atom 1.0 feed of a locale's hosted posts (`/{locale}/feed.xml`, src/app/[locale]/feed.xml/route.ts): the posts
 * written in that locale (`pathLocales`, so an untranslated post is only in its own language's feed), newest first,
 * with absolute links, the excerpt as the summary and the tags as categories. Search engines read it as a sitemap
 * too. Dates are the content's days at 00:00 UTC; an entry's `<updated>` is the translation's `updated` when set.
 */
import { postUpdated } from "@/content/blog";
import { getContent, getProfile } from "@/content/load";
import type { Locale, PostRef } from "@/content/schema";
import { pathLocales } from "@/lib/routes";
import { feedTitle } from "@/lib/seo";
import { FEED_TYPE, absoluteUrl, feedPath, localePath } from "@/lib/site";

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** "2026-10-27" -> "2026-10-27T00:00:00Z" (Atom dates are RFC 3339 date-times). */
const atomDate = (day: string) => `${day.slice(0, 10)}T00:00:00Z`;

/** Hosted posts written in `locale`, newest first (content order breaks ties). */
export function feedPosts(locale: Locale): PostRef[] {
  const posts = getContent().floors.library.posts.filter((p) => !p.url && pathLocales(`/blog/${p.slug}`).includes(locale));
  return posts.map((post, i) => ({ post, i })).sort((a, b) => (a.post.date === b.post.date ? a.i - b.i : a.post.date < b.post.date ? 1 : -1)).map(({ post }) => post);
}

export function atomFeed(locale: Locale): string {
  const name = getProfile().name;
  const self = absoluteUrl(feedPath(locale));
  const posts = feedPosts(locale).map((post) => ({ post, updated: postUpdated(post, locale) ?? post.date }));
  const entries = posts.map(({ post, updated }) => {
    const url = absoluteUrl(localePath(locale, `/blog/${post.slug}`));
    return [
      "  <entry>",
      `    <id>${escapeXml(url)}</id>`,
      `    <title>${escapeXml(post.title[locale])}</title>`,
      `    <link rel="alternate" type="text/html" href="${escapeXml(url)}"/>`,
      `    <published>${atomDate(post.date)}</published>`,
      `    <updated>${atomDate(updated)}</updated>`,
      `    <summary>${escapeXml(post.excerpt[locale])}</summary>`,
      ...post.tags.map((tag) => `    <category term="${escapeXml(tag)}"/>`),
      "  </entry>",
    ].join("\n");
  });
  const newest = posts.map(({ updated }) => updated).sort().at(-1);
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${locale}">`,
    `  <id>${escapeXml(self)}</id>`,
    `  <title>${escapeXml(feedTitle(locale))}</title>`,
    `  <link rel="self" type="${FEED_TYPE}" href="${escapeXml(self)}"/>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(absoluteUrl(localePath(locale, "/library")))}"/>`,
    ...(newest ? [`  <updated>${atomDate(newest)}</updated>`] : []),
    `  <author><name>${escapeXml(name)}</name><uri>${escapeXml(absoluteUrl(localePath(locale, "/")))}</uri></author>`,
    ...entries,
    "</feed>",
    "",
  ].join("\n");
}
