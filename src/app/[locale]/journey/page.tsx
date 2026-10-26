import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClientMessages } from "@/components/ClientMessages";
import { JourneyFilter } from "@/components/page/JourneyFilter";
import { PageIntro, SectionSplit } from "@/components/page/Layout";
import { TimelineRow } from "@/components/page/Timeline";
import { TimeTravel } from "@/components/time-travel/TimeTravel";
import { getTimeTravel } from "@/content/time-travel";
import { RepoWall, SideProjectGrid } from "@/components/WorkshopAnnex";
import { getPublicRepos, getSideProjects, getTimeline, getYears } from "@/content/load";
import { typeCounts } from "@/content/pageview";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { experienceDataVersion } from "@/experience/gate-data";
import { assertLocale } from "@/i18n/locale";
import { seoMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { pageJsonLd } from "@/lib/jsonld";

export async function generateMetadata({ params }: PageProps<"/[locale]/journey">): Promise<Metadata> {
  return seoMetadata(assertLocale((await params).locale), "/journey");
}

export default async function JourneyPage({ params }: PageProps<"/[locale]/journey">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "journey" });
  const years = [...getYears()].reverse();

  return (
    <ClientMessages>
      <JsonLd data={pageJsonLd(locale, "/journey")} />
      <ExperienceGate locale={locale} version={await experienceDataVersion(locale)} startFloor="L2" />
      <PageIntro
        title={t("navTitle")}
        lead={t("intro")}
        aside={
          <nav aria-label={t("yearNav")}>
            <p className="pv-data mb-3">{t("jumpTo")}</p>
            <ul className="flex flex-wrap gap-1.5">
              {years.map(({ year }) => (
                <li key={year}>
                  <a href={`#y${year}`} className="chip min-h-11">
                    {year}
                  </a>
                </li>
              ))}
              <li>
                <a href="#workshop" className="chip min-h-11">
                  {t("workshop")}
                </a>
              </li>
            </ul>
          </nav>
        }
      />
      <TimeTravel locale={locale} stops={getTimeTravel()} />
      <JourneyFilter counts={typeCounts(getTimeline())}>
        <ol className="pv-wrap">
          {years.map(({ year, entries }) => (
            <li key={year} id={`y${year}`} data-year="" className="grid gap-x-6 pt-14 lg:grid-cols-12 lg:pt-16">
              <h2 className="pv-num text-[48px] leading-[0.9] lg:sticky lg:top-[160px] lg:col-span-2 lg:self-start lg:text-[64px]">
                {year}
                <span className="pv-data mt-2.5 block">{t("entries", { count: entries.length })}</span>
              </h2>
              <ul className="pv-rows mt-4 lg:col-span-10 lg:mt-0 [&>li:first-child]:border-line-2">
                {[...entries].reverse().map((entry) => (
                  <TimelineRow key={entry.id} entry={entry} locale={locale} note={Number(entry.start.slice(0, 4)) < year ? t("prologue") : undefined} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </JourneyFilter>
      <SectionSplit id="workshop" title={t("workshop")} intro={t("workshopIntro")}>
        <SideProjectGrid projects={getSideProjects()} locale={locale} />
        <h3 className="pv-h3 mt-14 mb-4">{t("repos")}</h3>
        <RepoWall repos={getPublicRepos()} locale={locale} />
      </SectionSplit>
    </ClientMessages>
  );
}
