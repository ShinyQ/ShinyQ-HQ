import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChipList } from "@/components/Chip";
import { ExternalLink } from "@/components/ExternalLink";
import { ConfidenceBadge } from "@/components/MetricTile";
import { OrgLogo } from "@/components/OrgLogo";
import { FactRow } from "@/components/page/Case";
import { CrumbLink, Marker } from "@/components/page/Layout";
import { getContent, getPod, getTimeline, getTimelineEntry } from "@/content/load";
import { LOCALES } from "@/content/schema";
import { adjacent } from "@/content/selectors";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { experienceDataFor } from "@/experience/gate-data";
import { assertLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { TYPE_ACCENT } from "@/lib/accent";
import { formatPeriod } from "@/lib/format";
import { pageMetadata } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => getContent().floors.careerArchive.entries.map((e) => ({ locale, slug: e.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/journey/[slug]">): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = assertLocale(raw);
  const entry = getTimelineEntry(slug);
  if (!entry) return {};
  return pageMetadata({ locale, path: `/journey/${slug}`, title: `${entry.role[locale]} · ${entry.org}`, description: entry.summary[locale] });
}

export default async function JourneyEntryPage({ params }: PageProps<"/[locale]/journey/[slug]">) {
  const { locale: raw, slug } = await params;
  const locale = assertLocale(raw);
  setRequestLocale(locale);
  const entry = getTimelineEntry(slug);
  if (!entry) notFound();

  const t = await getTranslations({ locale, namespace: "journey" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const tl = await getTranslations({ locale, namespace: "labs" });
  const timeline = getTimeline();
  const { prev, next } = adjacent(timeline, timeline.findIndex((e) => e.id === entry.id));
  const pod = entry.podRef ? getPod(entry.podRef) : undefined;

  return (
    <>
      <ExperienceGate data={await experienceDataFor(locale)} startFloor="L2" startRoom={`L2:${entry.slug}`} />
      <article className="pv-wrap pt-6 sm:pt-10 lg:pt-14">
        <CrumbLink crumb={{ href: "/journey", label: t("navTitle") }} />
        <div className="mt-5 lg:w-3/4">
          <p className="pv-data flex flex-wrap items-center gap-x-4 gap-y-1">
            <Marker accent={TYPE_ACCENT[entry.type]}>{tc(`type.${entry.type}`)}</Marker>
            <span className="hidden sm:inline">L2:{entry.slug}</span>
          </p>
          <h1 className="pv-d-l mt-5">{entry.role[locale]}</h1>
          <p className="mt-5 flex items-center gap-3 text-lg text-ink">
            {entry.logo && <OrgLogo logo={entry.logo} locale={locale} size={36} />}
            <span>{entry.url ? <ExternalLink href={entry.url} className="pv-uline" srHint={tc("external")}>{entry.org}</ExternalLink> : entry.org}</span>
          </p>
        </div>
        <FactRow
          items={[
            {
              label: tl("period"),
              value: (
                <span className="flex flex-wrap items-center gap-3">
                  {formatPeriod(entry.start, entry.end, locale)}
                  {entry.confidence && <ConfidenceBadge confidence={entry.confidence} locale={locale} />}
                </span>
              ),
            },
          ]}
        />
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <p className="pv-lead mt-10">{entry.summary[locale]}</p>

            {entry.highlights.length > 0 && (
              <section aria-labelledby="highlights" className="pt-14">
                <h2 id="highlights" className="pv-h2 mb-6">
                  {tc("highlights")}
                </h2>
                <ul className="pv-rows pv-rows-closed">
                  {entry.highlights.map((h, i) => (
                    <li key={i} className="py-4 text-ink-2">
                      {h[locale]}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {entry.stack.length > 0 && (
              <section aria-labelledby="stack" className="pt-14">
                <h2 id="stack" className="pv-h2 mb-6">
                  {tc("stack")}
                </h2>
                <ChipList items={entry.stack} logos />
              </section>
            )}

            {pod && (
              <p className="pt-14">
                <Link href={`/labs/${pod.slug}`} className="card flex flex-wrap items-center gap-x-4 gap-y-1 p-5 transition hover:border-line-2 hover:bg-surface-2 sm:p-6">
                  <span className="pv-data">
                    <Marker accent="violet">L3 · {t("seeCaseStudy")}</Marker>
                  </span>
                  <span className="font-semibold text-ink">{pod.title[locale]} →</span>
                </Link>
              </p>
            )}
          </div>
        </div>

        <nav aria-label={t("navTitle")} className="pv-sec grid gap-4 md:grid-cols-2 md:gap-6">
          {prev ? (
            <Link href={`/journey/${prev.slug}`} className="card block p-5 transition hover:border-line-2 hover:bg-surface-2 sm:p-6">
              <span className="pv-data">← {tc("previous")}</span>
              <span className="pv-h3 mt-2 block">{prev.role[locale]}</span>
              <span className="pv-small mt-1 block">{prev.org}</span>
            </Link>
          ) : (
            <span className="hidden md:block" />
          )}
          {next && (
            <Link href={`/journey/${next.slug}`} className="card block p-5 transition hover:border-line-2 hover:bg-surface-2 sm:p-6 md:text-right">
              <span className="pv-data">{tc("next")} →</span>
              <span className="pv-h3 mt-2 block">{next.role[locale]}</span>
              <span className="pv-small mt-1 block">{next.org}</span>
            </Link>
          )}
        </nav>
      </article>
    </>
  );
}
