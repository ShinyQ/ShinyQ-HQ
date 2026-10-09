import { getTranslations } from "next-intl/server";
import type { Locale, TimelineEntry } from "@/content/schema";
import { Link } from "@/i18n/navigation";
import { formatPeriod } from "@/lib/format";
import { OrgLogo } from "./OrgLogo";

const TYPE_TONE: Record<TimelineEntry["type"], string> = {
  job: "text-amber border-amber/40",
  freelance: "text-cyan border-cyan/40",
  education: "text-green border-green/40",
  award: "text-pink border-pink/40",
  milestone: "text-violet border-violet/40",
};

export async function TimelineItem({ entry, locale, headingLevel = 3 }: { entry: TimelineEntry; locale: Locale; headingLevel?: 2 | 3 | 4 }) {
  const t = await getTranslations({ locale, namespace: "common" });
  const Heading = `h${headingLevel}` as const;
  return (
    <article className="glass relative p-4 transition hover:border-amber/60 sm:p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`label rounded border px-1.5 py-0.5 ${TYPE_TONE[entry.type]}`}>{t(`type.${entry.type}`)}</span>
        <span className="label text-ink-3">{formatPeriod(entry.start, entry.end, locale)}</span>
      </div>
      <Heading className="text-base leading-6 font-bold text-ink">
        <Link href={`/journey/${entry.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
          {entry.role[locale]}
        </Link>
      </Heading>
      <p className="mt-1 flex items-center gap-2 text-sm text-ink-2">
        {entry.logo && <OrgLogo logo={entry.logo} locale={locale} size={24} />}
        {entry.org}
      </p>
      <p className="mt-2 text-sm leading-6 text-ink-2">{entry.summary[locale]}</p>
    </article>
  );
}
