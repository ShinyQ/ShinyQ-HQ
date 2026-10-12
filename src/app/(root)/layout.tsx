import type { Metadata } from "next";
import type { ReactNode } from "react";
import { seoFor } from "@/lib/seo";
import { OG_IMAGE_SIZE, OG_IMAGE_TYPE, SITE_NAME, SITE_URL, ogImagePath } from "@/lib/site";
import { fontClassName } from "../fonts";
import "../globals.css";

const SEO = seoFor("en", "/");
const IMAGE = { url: ogImagePath(SEO.image), ...OG_IMAGE_SIZE, type: OG_IMAGE_TYPE, alt: SEO.imageAlt };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SEO.title,
  description: SEO.description,
  alternates: { canonical: "/", languages: { en: "/en", id: "/id", "x-default": "/en" } },
  openGraph: { title: SEO.title, description: SEO.description, siteName: SITE_NAME, type: "website", url: "/", images: [IMAGE] },
  twitter: { card: "summary_large_image", title: SEO.title, description: SEO.description, images: [IMAGE] },
};

export default function RootRedirectLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fontClassName} antialiased`}>
      <body className="flex min-h-screen items-center justify-center">{children}</body>
    </html>
  );
}
