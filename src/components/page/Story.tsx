import type { Locale, PodStory } from "@/content/schema";

/** Key decisions of a story case study: numbered like `StepList`, each a title and its reason (owner decision 2026-10-25). */
export function DecisionList({ decisions, locale, whyLabel }: { decisions: PodStory["decisions"]; locale: Locale; whyLabel: string }) {
  return (
    <ol className="pv-rows pv-rows-closed">
      {decisions.map((d, i) => (
        <li key={i} className="grid grid-cols-[40px_1fr] gap-3 py-5">
          <span aria-hidden="true" className="pt-1 font-mono text-xs text-violet">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink">{d.title[locale]}</p>
            <p className="mt-1.5 text-ink-2">
              <span className="pv-data mr-2">{whyLabel}</span>
              {d.why[locale]}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The owner's lesson: a quote with a neutral hairline rule (never a colored stripe). */
export function Lesson({ text }: { text: string }) {
  return <blockquote className="pv-lead border-l border-line-2 pl-5 text-ink">{text}</blockquote>;
}
