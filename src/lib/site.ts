import type { Metadata } from "next";
import { LOCALES, type Locale } from "@/content/schema";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kurniadi.pages.dev";
export const REPO_URL = "https://github.com/ShinyQ/ShinyQ-HQ";

export function cvPdfPath(fileName: string, locale: Locale): string {
  return `/cv/${fileName}-${locale}.pdf`;
}

/** Localized title/description plus canonical and hreflang alternates for a locale-relative path. */
export function pageMetadata({
  locale,
  path,
  title,
  description,
}: {
  locale: Locale;
  path: string;
  title?: string;
  description?: string;
}): Metadata {
  const suffix = path === "/" ? "" : path;
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `/${l}${suffix}`]));
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    alternates: {
      canonical: `/${locale}${suffix}`,
      languages: { ...languages, "x-default": `/en${suffix}` },
    },
    openGraph: {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      locale: locale === "id" ? "id_ID" : "en_US",
      type: "website",
      url: `/${locale}${suffix}`,
    },
  };
}
