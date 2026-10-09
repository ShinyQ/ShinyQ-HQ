import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OG_IMAGE_SIZE, SITE_NAME, SITE_URL, ogImagePath } from "@/lib/site";
import { getProfile } from "@/content/load";
import en from "../../../messages/en.json";
import { fontClassName } from "../fonts";
import "../globals.css";

const TITLE = `${SITE_NAME} · ${getProfile().name}`;
const DESCRIPTION = en.meta.description;
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
