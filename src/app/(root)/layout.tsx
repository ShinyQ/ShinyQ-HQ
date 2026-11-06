import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LOCALES } from "@/content/locales";
import { feedTitle, seoFor } from "@/lib/seo";
import { FEED_TYPE, SITE_NAME, SITE_URL, feedPath, ogImagePath, searchVerification, shareImage, twitterImage } from "@/lib/site";
import { fontClassName } from "../fonts";
import "../globals.css";

const SEO = seoFor("en", "/");
const IMAGE = shareImage(ogImagePath(SEO.image), SEO.imageAlt);
const VERIFICATION = searchVerification();

/**
 * "/" only redirects (by script) to a locale home, so search engines and link unfurlers are pointed
 * at the English home: canonical and og:url are "/en" (the x-default), like the redirect a crawler
 * without a stored choice follows. The share card is the same as /en's. Both locales' feeds are linked, so a feed
 * reader given the bare domain finds them.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SEO.searchTitle,
  description: SEO.description,
  alternates: {
    canonical: "/en",
    languages: { en: "/en", id: "/id", "x-default": "/en" },
    types: { [FEED_TYPE]: LOCALES.map((locale) => ({ url: feedPath(locale), title: feedTitle(locale) })) },
  },
  openGraph: { title: SEO.title, description: SEO.description, siteName: SITE_NAME, type: "website", url: "/en", locale: "en_US", images: [IMAGE] },
  twitter: { card: "summary_large_image", title: SEO.title, description: SEO.description, images: [twitterImage(IMAGE)] },
  ...(VERIFICATION ? { verification: VERIFICATION } : {}),
};

export default function RootRedirectLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fontClassName} antialiased overflow-x-clip`}>
      <body className="flex min-h-screen items-center justify-center overflow-x-clip">{children}</body>
    </html>
  );
}
