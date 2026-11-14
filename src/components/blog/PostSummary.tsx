import { AccentDot } from "@/components/AccentDot";
import type { Locale } from "@/content/schema";

/**
 * The AI Summary block above a post's body (owner decision 2026-11-14): `PostRef.summary` as one continuous paragraph in
 * the language the body is written in, under a label that says the text is generated. Static and server-only: no client
 * JS, no motion. The label is a paragraph, never a heading, so "On this page" keeps listing only the body's h2s.
 */
export function PostSummary({ text, label, labelLang, lang }: { text: string; label: string; labelLang: Locale; lang: Locale }) {
  return (
    <aside className="pv-summary card p-5 sm:p-6" aria-labelledby="post-summary">
      <div className="pv-summary-head">
        <span className="pv-summary-mark" aria-hidden="true">
          <AccentDot tone="cyan" />
        </span>
        <p id="post-summary" className="pv-meta" lang={labelLang}>
          {label}
        </p>
        <span className="pv-summary-rule" aria-hidden="true" />
      </div>
      <div lang={lang} data-summary-paragraphs>
        <p className="pv-summary-text">{text}</p>
      </div>
    </aside>
  );
}
