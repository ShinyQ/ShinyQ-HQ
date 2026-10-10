import { getTranslations } from "next-intl/server";
import type { Locale, TimelineEntry } from "@/content/schema";
import { Link } from "@/i18n/navigation";
import { TYPE_ACCENT } from "@/lib/accent";
import { formatPeriod } from "@/lib/format";
import { OrgLogo } from "../OrgLogo";
import { Marker } from "./Layout";

/** One career entry as a ruled row: period, role (link), organization, summary and type. */
export async function TimelineRow({
  entry,
  locale,
  headingLevel = 3,
  note,
}: {
  entry: TimelineEntry;
  locale: Locale;
  headingLevel?: 3 | 4;
  /** Small label above the role, such as "Prologue". */
  note?: string;
}) {
  const t = await getTranslations({ locale, namespace: "common" });
  const Heading = `h${headingLevel}` as const;
  return (
    <li
      data-entry=""
      data-type={entry.type}
      className="grid gap-x-6 gap-y-1.5 py-5 [--pv-hover:var(--color-amber)] md:grid-cols-[150px_minmax(0,1fr)_120px] md:py-6"
    >
      <p className="pv-data md:pt-1.5">{formatPeriod(entry.start, entry.end, locale)}</p>
      <div className="min-w-0">
        {note && <p className="pv-data mb-1">{note}</p>}
        <Heading className="pv-h3 pv-row-title">
          <Link href={`/journey/${entry.slug}`} className="pv-stretch">
            {entry.role[locale]}
          </Link>
        </Heading>
        <p className="mt-1.5 flex items-center gap-2.5 text-[15px] text-ink-2">
          {entry.logo && <OrgLogo logo={entry.logo} locale={locale} size={24} />}
          {entry.org}
        </p>
        <p className="mt-2.5 max-w-[64ch] text-[15px] leading-6 text-ink-2">{entry.summary[locale]}</p>
      </div>
      <p className="pv-data -order-1 md:order-none md:pt-1.5">
        <Marker accent={TYPE_ACCENT[entry.type]}>{t(`type.${entry.type}`)}</Marker>
      </p>
    </li>
  );
}
