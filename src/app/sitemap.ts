import type { MetadataRoute } from "next";
import { getContent } from "@/content/load";
import { LOCALES } from "@/content/schema";
import { allPagePaths } from "@/lib/routes";
import { absoluteUrl, languageAlternates, localePath } from "@/lib/site";

export const dynamic = "force-static";

const PRIORITY: Record<string, number> = { "/": 1, "/quick": 0.9, "/labs": 0.8, "/journey": 0.8, "/cv": 0.7 };

/** One entry per locale and page, each with hreflang alternates (appendix 04). */
export default function sitemap(): MetadataRoute.Sitemap {
  const posts = new Map(getContent().floors.library.posts.map((p) => [`/blog/${p.slug}`, p.date]));
  return allPagePaths().flatMap((path) =>
    LOCALES.map((locale) => ({
      url: absoluteUrl(localePath(locale, path)),
      ...(posts.has(path) ? { lastModified: posts.get(path) } : {}),
      priority: PRIORITY[path] ?? 0.6,
      alternates: { languages: languageAlternates(path, absoluteUrl) },
    })),
  );
}
