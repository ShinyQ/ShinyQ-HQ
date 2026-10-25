import { Link } from "@/i18n/navigation";
import type { Locale } from "@/content/schema";
import { TALLY_KEYS, type TallyKey, type TtStop } from "@/content/time-travel";

export interface YearPanelText {
  tally: Record<TallyKey, string>;
  added: (count: number) => string;
  highlights: string;
  see: string;
}

/** One stop: the year, the owner's caption, the running tally and the highlights. Hidden unless it is the shown stop. */
export function YearPanel({ stop, label, hidden, locale, text }: { stop: TtStop; label: string; hidden: boolean; locale: Locale; text: YearPanelText }) {
  return (
    <div data-tt-panel="" data-stop={stop.id} hidden={hidden} className="grid gap-x-6 gap-y-5 lg:grid-cols-12">
      <h3 className="pv-num text-[48px] leading-[0.9] lg:col-span-3 lg:text-[64px]">{label}</h3>
      <div className="min-w-0 lg:col-span-8">
        <p className="pv-lead">{stop.caption[locale]}</p>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {TALLY_KEYS.map((key) => (
            <div key={key}>
              <dt className="pv-data">{text.tally[key]}</dt>
              <dd className="pv-num mt-1 text-[28px] leading-none">{stop.tally[key].total}</dd>
              {stop.tally[key].added > 0 && <dd className="pv-small mt-1">{text.added(stop.tally[key].added)}</dd>}
            </div>
          ))}
        </dl>
        {stop.highlights.length > 0 && (
          <>
            <h4 className="pv-data mt-6">{text.highlights}</h4>
            <ul className="mt-2 flex flex-col gap-1.5">
              {stop.highlights.map((h) => (
                <li key={h.href + h.label.en}>
                  <Link href={h.href} className="pv-uline inline-flex min-h-11 items-center text-sm font-semibold text-ink hover:text-cyan">
                    {h.label[locale]}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-4">
          <a href={`#${stop.anchor}`} className="pv-go">
            {text.see}
          </a>
        </p>
      </div>
    </div>
  );
}
