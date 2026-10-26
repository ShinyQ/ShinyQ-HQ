import type { Locale, PodStory } from "@/content/schema";

/** Key decisions of a story case study: numbered like `StepList`, each a title and its reason (owner decision 2026-10-25). */
export function DecisionList({ decisions, locale, whyLabel }: { decisions: PodStory["decisions"]; locale: Locale; whyLabel: string }) {
  return (
    <ol className="pv-rows pv-rows-closed">
      {decisions.map((d, i) => (
        <li key={i} className="grid grid-cols-[40px_1fr] gap-3 py-5">
          <span aria-hidden="true" className="pv-num text-xl text-ink-3">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="pv-h3">{d.title[locale]}</p>
            <p className="mt-2 text-ink-2">
              <span className="font-semibold text-ink">{whyLabel}:</span> {d.why[locale]}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The owner's lesson: a quote with a neutral hairline rule (never a colored stripe). */
export function Lesson({ text }: { text: string }) {
  return <blockquote className="pv-h3 border-l border-line-2 pl-6 leading-snug">{text}</blockquote>;
}
