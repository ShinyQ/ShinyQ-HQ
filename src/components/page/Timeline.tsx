import { getTranslations } from "next-intl/server";
import type { Locale, TimelineEntry } from "@/content/schema";
import { Link } from "@/i18n/navigation";
import { formatPeriod } from "@/lib/format";
import { OrgLogo } from "../OrgLogo";
import { TypeMarker } from "./Layout";

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
      <p className="pv-date md:pt-1.5">{formatPeriod(entry.start, entry.end, locale)}</p>
      <div className="min-w-0">
        <Heading className="pv-h3 pv-row-title">
          <Link href={`/journey/${entry.slug}`} className="pv-stretch">
            {entry.role[locale]}
          </Link>
        </Heading>
        {note && <p className="pv-meta mt-1">{note}</p>}
        <p className="mt-2 flex items-center gap-2.5 text-ink-2">
          {entry.logo && <OrgLogo logo={entry.logo} locale={locale} size={24} />}
          {entry.org}
        </p>
        <p className="pv-small mt-2.5 max-w-[64ch]">{entry.summary[locale]}</p>
      </div>
      <p className="pv-meta md:pt-1.5">
        <TypeMarker type={entry.type}>{t(`type.${entry.type}`)}</TypeMarker>
      </p>
    </li>
  );
}
