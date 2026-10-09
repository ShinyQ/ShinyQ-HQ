import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fontClassName } from "../fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: "ShinyQ HQ · Kurniadi Ahmad Wijaya",
  description: "Software Engineer and AI Engineer (Azure). Choose English or Bahasa Indonesia.",
  alternates: { languages: { en: "/en", id: "/id", "x-default": "/en" } },
};

export default function RootRedirectLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fontClassName} antialiased`}>
      <body className="flex min-h-screen items-center justify-center">{children}</body>
    </html>
  );
}
