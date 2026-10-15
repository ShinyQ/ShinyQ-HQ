import Link from "next/link";
import type { Metadata } from "next";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { fontClassName } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: `404 · ${en.meta.siteName}`,
  description: en.notFound.body,
  robots: { index: false, follow: true },
};

export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${fontClassName} antialiased`}>
      <body className="flex min-h-screen items-center">
        <main className="pv-wrap py-16">
          <p className="pv-data">404</p>
          <h1 className="pv-d-l mt-5">{en.notFound.title}</h1>
          <p className="pv-lead mt-6">{en.notFound.body}</p>
          <h2 lang="id" className="pv-h2 mt-8">{id.notFound.title}</h2>
          <p lang="id" className="pv-body mt-3">
            {id.notFound.body}
          </p>
          <p className="mt-8 flex flex-wrap gap-3">
            <Link className="pv-btn pv-btn-primary" href="/en">
              {en.notFound.home} (EN)
            </Link>
            <Link className="pv-btn pv-btn-ghost" href="/id" lang="id">
              {id.notFound.home} (ID)
            </Link>
          </p>
        </main>
      </body>
    </html>
  );
}
