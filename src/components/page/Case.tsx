import type { ReactNode } from "react";
import type { Locale, LocalizedText } from "@/content/schema";

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
}

/** Results as a ledger: ruled rows with the number in a fixed column, then what it measures and how it was measured. */
export function MetricLedger({ results, locale }: { results: readonly LedgerResult[]; locale: Locale }) {
  return (
    <ul className="pv-rows pv-rows-closed">
      {results.map((r, i) => (
        <li key={i} className="grid gap-x-6 gap-y-2 py-5 sm:grid-cols-[13.5rem_minmax(0,1fr)] sm:items-baseline sm:py-6">
          <p className="pv-num text-[30px] leading-none sm:text-[34px]">{r.value}</p>
          <div className="min-w-0">
            <p className="text-[15px] leading-[22px] text-ink">{r.label[locale]}</p>
            {r.context && <p className="mt-1.5 text-[13px] leading-[20px] text-ink-3">{r.context[locale]}</p>}
          </div>
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
