import type { ReactNode } from "react";
import type { Delta, Locale, LocalizedText } from "@/content/schema";
import { impactResults, scaleResults } from "@/content/selectors";
import { DeltaValue, type DeltaLabels } from "../DeltaValue";

/** Key facts in ruled columns (role, period, client...). Items without a value are skipped. */
export function FactRow({ items }: { items: { label: string; value?: ReactNode }[] }) {
  const shown = items.filter((item) => item.value);
  return (
    <dl className="mt-12 grid border-y border-line md:grid-flow-col md:auto-cols-fr">
      {shown.map((item, i) => (
        <div key={item.label} className={`py-4 md:py-5 md:pr-6 ${i > 0 ? "border-t border-line md:border-t-0 md:border-l md:pl-6" : ""}`}>
          <dt className="pv-meta">{item.label}</dt>
          <dd className="mt-1 text-ink [overflow-wrap:anywhere]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface LedgerResult {
  value: string;
  label: LocalizedText;
  context?: LocalizedText;
  kind?: "impact" | "scale";
  delta?: Delta;
}

/**
 * Results as a ledger: ruled rows with the number in a fixed column, then what it measures and how it was measured.
 * Impact results lead (owner decision 2026-11-13); scale results (PRs, tests, "N weeks") collapse into one muted line
 * after them, `value` and `label` only (the label carries the essential boundary).
 */
export function MetricLedger({ results, locale, labels }: { results: readonly LedgerResult[]; locale: Locale; labels: { delta: DeltaLabels; scale: string } }) {
  const impact = impactResults(results);
  const scale = scaleResults(results);
  return (
    <>
      <ul className="pv-rows pv-rows-closed">
        {impact.map((r, i) => (
          <li key={i} className="grid gap-x-6 gap-y-2 py-5 sm:grid-cols-[13.5rem_minmax(0,1fr)] sm:items-baseline sm:py-6">
            <p className="pv-num text-[30px] leading-none sm:text-[34px]">
              <DeltaValue value={r.value} delta={r.delta} labels={labels.delta} />
            </p>
            <div className="min-w-0">
              <p className="text-ink">{r.label[locale]}</p>
              {r.context && <p className="pv-meta mt-1.5">{r.context[locale]}</p>}
            </div>
          </li>
        ))}
      </ul>
      {scale.length > 0 && (
        <p className="pv-meta mt-5" data-testid="scale-line">
          {labels.scale} {scale.map((r) => `${r.value} ${lowerFirst(r.label[locale])}`).join(", ")}.
        </p>
      )}
    </>
  );
}

/** "Merged pull requests" -> "merged pull requests"; acronyms ("PRs merged") stay. */
function lowerFirst(text: string): string {
  return /^[A-Z][A-Z]/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

/** Ordered steps; the number is the real sequence of the work. */
export function StepList({ steps, locale }: { steps: readonly LocalizedText[]; locale: Locale }) {
  return (
    <ol className="pv-rows pv-rows-closed">
      {steps.map((step, i) => (
        <li key={i} className="grid grid-cols-[40px_1fr] gap-3 py-4 text-ink-2">
          <span aria-hidden="true" className="pv-num text-xl text-ink-3">
            {i + 1}
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
    <section id={id} aria-labelledby={`${id}-title`} className="pt-20 lg:pt-32">
      <h2 id={`${id}-title`} className="pv-h2 mb-8">
        {title}
      </h2>
      {children}
    </section>
  );
}
