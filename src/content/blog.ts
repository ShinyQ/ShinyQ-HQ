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
