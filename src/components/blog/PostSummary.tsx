import { AccentDot } from "@/components/AccentDot";
import type { Locale } from "@/content/schema";

/** Split the opening sentence from the rest so the field note has a clear way in without becoming two paragraphs. */
function splitLead(text: string): [lead: string, rest: string] {
  const end = text.search(/[.!?](?=\s)/);
  if (end < 0) return [text, ""];
  return [text.slice(0, end + 1), text.slice(end + 1).trimStart()];
}

/**
 * The AI Summary block above a post's body (owner decision 2026-11-14): `PostRef.summary` as one continuous paragraph in
 * the language the body is written in, under a label that says the text is generated. Static and server-only: no client
 * JS, no motion. The label is a paragraph, never a heading, so "On this page" keeps listing only the body's h2s.
 */
export function PostSummary({ text, label, labelLang, lang }: { text: string; label: string; labelLang: Locale; lang: Locale }) {
  const [lead, rest] = splitLead(text);
  return (
    <aside className="pv-summary card p-5 sm:p-6" aria-labelledby="post-summary">
      <div className="pv-summary-tab">
        <AccentDot tone="cyan" />
        <p id="post-summary" className="pv-meta" lang={labelLang}>
          {label}
        </p>
      </div>
      <div lang={lang} data-summary-paragraphs>
        <p className="pv-summary-text">
          <span className="pv-summary-lead">{lead}</span>
          {rest ? ` ${rest}` : null}
        </p>
      </div>
    </aside>
  );
}
