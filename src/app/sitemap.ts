import type { MetadataRoute } from "next";
import { LOCALES } from "@/content/schema";
import { allPagePaths, lastModified } from "@/lib/routes";
import { absoluteUrl, languageAlternates, localePath } from "@/lib/site";

export const dynamic = "force-static";

const PRIORITY: Record<string, number> = { "/": 1, "/quick": 0.9, "/labs": 0.8, "/journey": 0.8, "/cv": 0.7 };

/** One entry per locale and page, each with hreflang alternates (appendix 04). */
export default function sitemap(): MetadataRoute.Sitemap {
  return allPagePaths().flatMap((path) => {
    const lastModifiedDate = lastModified(path);
    return LOCALES.map((locale) => ({
      url: absoluteUrl(localePath(locale, path)),
      ...(lastModifiedDate ? { lastModified: lastModifiedDate } : {}),
      priority: PRIORITY[path] ?? 0.6,
      alternates: { languages: languageAlternates(path, absoluteUrl) },
    }));
  });
}
