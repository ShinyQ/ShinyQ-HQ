import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { LOCALES, type Locale } from "./schema";

export const BLOG_DIR = path.join(process.cwd(), "content", "blog");

const FILE_PATTERN = /^([a-z0-9-]+)\.(en|id)\.mdx$/;

/** Every MDX file in content/blog as { slug, locale, file }. */
export function listBlogFiles(): { slug: string; locale: Locale; file: string }[] {
  if (!existsSync(BLOG_DIR)) return [];
  return readdirSync(BLOG_DIR).flatMap((name) => {
    const match = FILE_PATTERN.exec(name);
    return match ? [{ slug: match[1], locale: match[2] as Locale, file: path.join(BLOG_DIR, name) }] : [];
  });
}

/**
 * Returns the MDX source for a post in the requested locale, falling back to
 * any available translation (spec appendix 04: show the original with a note).
 */
export function getPostSource(slug: string, locale: Locale): { locale: Locale; source: string } | undefined {
  const order = [locale, ...LOCALES.filter((l) => l !== locale)];
  for (const candidate of order) {
    const file = path.join(BLOG_DIR, `${slug}.${candidate}.mdx`);
    if (existsSync(file)) return { locale: candidate, source: readFileSync(file, "utf8") };
  }
  return undefined;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * The optional `updated: "YYYY-MM-DD"` line of an MDX post's frontmatter: the day of the last significant revision
 * of that translation (owner-set, never derived). Throws on a malformed value, so a typo fails the build.
 */
export function frontmatterUpdated(source: string): string | undefined {
  const value = FRONTMATTER.exec(source)?.[1].match(/^updated:\s*(.*?)\s*$/m)?.[1];
  if (value === undefined) return undefined;
  const day = /^"(\d{4}-\d{2}-\d{2})"$/.exec(value)?.[1];
  const time = day ? Date.parse(`${day}T00:00:00Z`) : Number.NaN;
  if (!day || Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== day) throw new Error(`frontmatter updated must be a quoted YYYY-MM-DD day, got ${value}`);
  return day;
}

/**
 * When the translation a locale renders (`getPostSource`) was last revised: its frontmatter `updated`, only when it
 * is later than the post's `date` (an earlier one is a content error and throws). Drives `dateModified`,
 * `article:modified_time`, the visible "Updated" date, the feed entry's `<updated>` and the sitemap `lastmod`.
 */
export function postUpdated(post: { slug: string; date: string }, locale: Locale): string | undefined {
  const found = getPostSource(post.slug, locale);
  const updated = found ? frontmatterUpdated(found.source) : undefined;
  if (!updated || updated === post.date.slice(0, 10)) return undefined;
  if (updated < post.date) throw new Error(`${post.slug}.${found!.locale}.mdx: updated ${updated} is before the post date ${post.date}`);
  return updated;
}
