import type { Metadata } from "next";
import { LOCALES, type Locale } from "@/content/schema";

const DEFAULT_SITE_URL = "https://kurniadi.pages.dev";

/** Absolute origin without a trailing slash. Empty or invalid env values fall back to the default. */
export function resolveSiteUrl(value: string | undefined): string {
  const candidate = value?.trim();
  if (!candidate) return DEFAULT_SITE_URL;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : DEFAULT_SITE_URL;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export const SITE_URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
export const SITE_NAME = "ShinyQ HQ";
export const REPO_URL = "https://github.com/ShinyQ/ShinyQ-HQ";

/**
 * Cloudflare Web Analytics site token, read at build time. The beacon is
 * omitted when unset or malformed (tokens are hex strings).
 */
export function resolveBeaconToken(value: string | undefined): string | undefined {
  const token = value?.trim();
  return token && /^[A-Za-z0-9]{16,64}$/.test(token) ? token : undefined;
}

export const CF_BEACON_TOKEN = resolveBeaconToken(process.env.NEXT_PUBLIC_CF_BEACON_TOKEN);

export function cvPdfPath(fileName: string, locale: Locale): string {
  return `/cv/${fileName}-${locale}.pdf`;
}

/** Locale-prefixed path: ("/", "en") -> "/en", ("/labs", "id") -> "/id/labs". */
export function localePath(locale: Locale, path: string): string {
  return `/${locale}${path === "/" ? "" : path}`;
}

/** Absolute URL on the canonical origin. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** hreflang map for a locale-relative path, including x-default (English). */
export function languageAlternates(path: string, toUrl: (p: string) => string = (p) => p): Record<string, string> {
  return {
    ...Object.fromEntries(LOCALES.map((l) => [l, toUrl(localePath(l, path))])),
    "x-default": toUrl(localePath("en", path)),
  };
}

export type OgTarget = { kind: "default"; locale: Locale } | { kind: "labs" | "blog"; locale: Locale; slug: string };

/** Public path of a build-time OG PNG, e.g. "/og/en.png" or "/og/id/labs/<slug>.png" (see src/app/og). */
export function ogImagePath(target: OgTarget): string {
  return target.kind === "default" ? `/og/${target.locale}.png` : `/og/${target.locale}/${target.kind}/${target.slug}.png`;
}

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export const OG_LOCALE: Record<Locale, string> = { en: "en_US", id: "id_ID" };

/**
 * Localized title/description, canonical, hreflang alternates, Open Graph
 * and Twitter card for a locale-relative path. `image` defaults to the
 * locale's default share card.
 */
export function pageMetadata({
  locale,
  path,
  title,
  description,
  type = "website",
  publishedTime,
  tags,
  image,
  imageAlt,
}: {
  locale: Locale;
  path: string;
  title?: string;
  description?: string;
  type?: "website" | "article";
  publishedTime?: string;
  tags?: string[];
  image?: string;
  imageAlt?: string;
}): Metadata {
  const url = localePath(locale, path);
  const images = [
    {
      url: image ?? ogImagePath({ kind: "default", locale }),
      ...OG_IMAGE_SIZE,
      type: "image/png",
      alt: imageAlt ?? title ?? SITE_NAME,
    },
  ];
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    alternates: {
      canonical: url,
      languages: languageAlternates(path),
    },
    openGraph: {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      siteName: SITE_NAME,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      url,
      images,
      ...(type === "article" ? { type, ...(publishedTime ? { publishedTime } : {}), ...(tags?.length ? { tags } : {}) } : { type }),
    },
    twitter: {
      card: "summary_large_image",
      images,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
    },
  };
}
