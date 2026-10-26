import Link from "next/link";
import type { Metadata, Viewport } from "next";
import { DidYouMean } from "@/components/DidYouMean";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { fontClassName } from "./fonts";
import "./globals.css";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: `404 · ${en.meta.siteName}`,
  description: en.notFound.body,
  robots: { index: false, follow: true },
};

export const viewport: Viewport = { themeColor: "#05050c" };

/**
 * The 404 (owner decision 2026-10-25, option B): Rover took a wrong turn, in English with one Indonesian line (the URL may
 * carry no locale), three ways out with the CV first for recruiters, and a "Did you mean" suggestion from the static route
 * index. Works without JavaScript; only the suggestion needs it.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${fontClassName} antialiased`}>
      <body className="flex min-h-screen items-center">
        <main className="pv-wrap py-16 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={`mx-auto ${styles.rover}`}
            src="/brand/rover-mark.svg"
            alt=""
            width={88}
            height={88}
          />
          <p className="pv-data mt-5 text-cyan">{en.notFound.kicker}</p>
          <h1 className="pv-d-l mt-3">{en.notFound.title}</h1>
          <p className="pv-lead mx-auto mt-4 text-ink-2">{en.notFound.body}</p>
          <p lang="id" className="mt-2 text-sm text-ink-3">
            {id.notFound.title}. {id.notFound.body}
          </p>
          <DidYouMean label={en.notFound.didYouMean} className="mt-6 min-h-6" />
          <nav
            aria-label={en.notFound.waysBack}
            className="mx-auto mt-7 grid max-w-xl gap-3 sm:grid-cols-3"
          >
            <Link
              className="pv-btn pv-btn-primary flex flex-col items-start text-left"
              href="/en/cv"
              data-testid="not-found-cv"
            >
              <b className="block">{en.notFound.cv}</b>
              <span className="text-xs font-normal">{en.notFound.cvHint}</span>
            </Link>
            <Link
              className="pv-btn pv-btn-ghost flex flex-col items-start text-left"
              href="/en/labs"
              data-testid="not-found-work"
            >
              <b className="block">{en.notFound.work}</b>
              <span className="text-xs font-normal text-ink-3">
                {en.notFound.workHint}
              </span>
            </Link>
            <div
              className="flex flex-col items-start rounded-xl border border-line-2 px-5 py-3 text-left"
              data-testid="not-found-home"
            >
              <b className="block text-[15px] font-semibold">{en.notFound.home}</b>
              <span className="flex flex-wrap items-center gap-x-2 text-xs">
                <Link className="pv-uline inline-flex min-h-11 items-center" href="/en">
                  English
                </Link>
                <span aria-hidden="true">·</span>
                <Link
                  className="pv-uline inline-flex min-h-11 items-center"
                  href="/id"
                  lang="id"
                >
                  Bahasa Indonesia
                </Link>
              </span>
            </div>
          </nav>
        </main>
      </body>
    </html>
  );
}
