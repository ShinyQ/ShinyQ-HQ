import type { MetadataRoute } from "next";
import { allPagePaths, lastModified, pathLocales, sitemapDate } from "@/lib/routes";
import { absoluteUrl, languageAlternates, localePath } from "@/lib/site";

export const dynamic = "force-static";

const PRIORITY: Record<string, number> = { "/": 1, "/quick": 0.9, "/labs": 0.8, "/journey": 0.8, "/cv": 0.7 };

/**
 * One entry per page in each locale its content is written in (`pathLocales`), with hreflang alternates when there
 * is more than one (appendix 04). A post's fallback copy in another locale is not listed: its canonical is the original.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return allPagePaths().flatMap((path) => {
    const locales = pathLocales(path);
    const languages = languageAlternates(path, absoluteUrl, locales);
    return locales.map((locale) => {
      const lastModifiedDate = sitemapDate(lastModified(path, locale));
      return {
        url: absoluteUrl(localePath(locale, path)),
        ...(lastModifiedDate ? { lastModified: lastModifiedDate } : {}),
        priority: PRIORITY[path] ?? 0.6,
        ...(Object.keys(languages).length ? { alternates: { languages } } : {}),
      };
    });
  });
}
