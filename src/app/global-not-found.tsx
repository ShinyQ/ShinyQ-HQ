import Link from "next/link";
import type { Metadata } from "next";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { fontClassName } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "404 · ShinyQ HQ",
  description: en.notFound.body,
};

export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${fontClassName} antialiased`}>
      <body className="flex min-h-screen items-center justify-center p-4">
        <main className="glass max-w-md p-8 text-center">
          <p className="font-mono text-4xl text-cyan" aria-hidden="true">
            o_o
          </p>
          <h1 className="mt-4 text-2xl font-extrabold text-ink">{en.notFound.title}</h1>
          <p className="mt-2 text-ink-2">{en.notFound.body}</p>
          <p lang="id" className="mt-2 text-ink-2">{id.notFound.body}</p>
          <p className="mt-6 flex justify-center gap-4">
            <Link className="link" href="/en">
              {en.notFound.home} (EN)
            </Link>
            <Link className="link" href="/id" lang="id">
              {id.notFound.home} (ID)
            </Link>
          </p>
        </main>
      </body>
    </html>
  );
}
