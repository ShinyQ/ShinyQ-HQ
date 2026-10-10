import type { ReactNode } from "react";
import type { Confidence, Locale, LocalizedText } from "@/content/schema";
import { ConfidenceBadge } from "../MetricTile";

/** Key facts in ruled columns (role, period, client...). Items without a value are skipped. */
export function FactRow({ items }: { items: { label: string; value?: ReactNode }[] }) {
  const shown = items.filter((item) => item.value);
  return (
    <dl className="mt-10 grid border-y border-line md:grid-flow-col md:auto-cols-fr">
      {shown.map((item, i) => (
        <div key={item.label} className={`py-4 md:py-5 md:pr-6 ${i > 0 ? "border-t border-line md:border-t-0 md:border-l md:pl-6" : ""}`}>
          <dt className="pv-data">{item.label}</dt>
          <dd className="mt-1.5 text-[15px] leading-[22px] text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface LedgerResult {
  value: string;
  label: LocalizedText;
  context?: LocalizedText;
  confidence?: Confidence;
}

/** Results as a ledger: the number, what it measures, its context and how sure it is. */
export function MetricLedger({ results, locale }: { results: readonly LedgerResult[]; locale: Locale }) {
  return (
    <ul className="grid grid-cols-2 border-b border-line lg:grid-cols-4">
      {results.map((r, i) => (
        <li
          key={i}
          className={`flex flex-col gap-2.5 border-t border-line py-5 pr-4 lg:border-t-0 lg:py-7 lg:pr-6 ${i % 2 === 1 ? "border-l pl-4" : ""} ${i % 4 !== 0 ? "lg:border-l lg:pl-6" : "lg:border-l-0 lg:pl-0"}`}
        >
          <p className="pv-num text-[28px] sm:text-[36px] lg:text-[40px]">{r.value}</p>
          <p className="text-sm leading-[21px] text-ink">{r.label[locale]}</p>
          {r.context && <p className="text-[13px] leading-[19px] text-ink-3">{r.context[locale]}</p>}
          {r.confidence && (
            <p className="mt-auto pt-1">
              <ConfidenceBadge confidence={r.confidence} locale={locale} />
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Ordered steps; the number is the real sequence of the work. */
export function StepList({ steps, locale }: { steps: readonly LocalizedText[]; locale: Locale }) {
  return (
    <ol className="pv-rows pv-rows-closed">
      {steps.map((step, i) => (
        <li key={i} className="grid grid-cols-[40px_1fr] gap-3 py-4 text-ink-2">
          <span aria-hidden="true" className="pt-1 font-mono text-xs text-violet">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span>{step[locale]}</span>
        </li>
      ))}
    </ol>
  );
}

/** Case-study chapter: an h2 and its content, an anchor for the table of contents. */
export function Chapter({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="pt-16 lg:pt-20">
      <h2 id={`${id}-title`} className="pv-h2 mb-6">
        {title}
      </h2>
      {children}
    </section>
  );
}
