import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OG_IMAGE_SIZE, SITE_NAME, SITE_URL, ogImagePath } from "@/lib/site";
import { fontClassName } from "../fonts";
import "../globals.css";

const TITLE = "ShinyQ HQ · Kurniadi Ahmad Wijaya";
const DESCRIPTION = "Software Engineer and AI Engineer (Azure). Choose English or Bahasa Indonesia.";
const IMAGE = { url: ogImagePath({ kind: "default", locale: "en" }), ...OG_IMAGE_SIZE, type: "image/png", alt: SITE_NAME };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/", languages: { en: "/en", id: "/id", "x-default": "/en" } },
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: SITE_NAME, type: "website", url: "/", images: [IMAGE] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [IMAGE] },
};

export default function RootRedirectLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fontClassName} antialiased`}>
      <body className="flex min-h-screen items-center justify-center">{children}</body>
    </html>
  );
}
