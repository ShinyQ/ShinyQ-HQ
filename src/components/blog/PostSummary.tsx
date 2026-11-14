import { AccentDot } from "@/components/AccentDot";
import type { Locale } from "@/content/schema";

/**
 * The AI Summary block above a post's body (owner decision 2026-11-14): `PostRef.summary` as one continuous paragraph in
 * the language the body is written in, under a label that says the text is generated. Static and server-only: no client
 * JS, no motion. The label is a paragraph, never a heading, so "On this page" keeps listing only the body's h2s.
 */
export function PostSummary({ text, label, labelLang, lang }: { text: string; label: string; labelLang: Locale; lang: Locale }) {
  return (
    <aside className="card p-5 sm:p-6" aria-labelledby="post-summary">
      <p id="post-summary" className="pv-meta flex items-center gap-2" lang={labelLang}>
        <AccentDot tone="cyan" />
        {label}
      </p>
      <div className="mt-3" lang={lang} data-summary-paragraphs>
        <p className="pv-body text-ink">{text}</p>
      </div>
    </aside>
  );
}
