import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container, PageHeader, Section } from "@/components/Section";
import { TimelineItem } from "@/components/TimelineItem";
import { RepoWall, SideProjectGrid } from "@/components/WorkshopAnnex";
import { getPublicRepos, getSideProjects, getYears } from "@/content/load";
import { assertLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/journey">): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "journey" });
  return pageMetadata({ locale, path: "/journey", title: t("title"), description: t("intro") });
}

export default async function JourneyPage({ params }: PageProps<"/[locale]/journey">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "journey" });
  const tf = await getTranslations({ locale, namespace: "floors" });
  const years = getYears();

  return (
    <Container>
      <PageHeader eyebrow={`L2 · ${tf("L2")}`} title={t("title")} intro={t("intro")}>
        <nav aria-label={t("yearNav")} className="mt-6 -mx-4 overflow-x-auto px-4">
          <ul className="flex gap-2">
            {years.map(({ year }) => (
              <li key={year}>
                <a href={`#y${year}`} className="label inline-flex min-h-11 items-center rounded-full border border-amber/40 px-4 text-amber transition hover:bg-amber/10">
                  {year}
                </a>
              </li>
            ))}
            <li>
              <a href="#workshop" className="label inline-flex min-h-11 items-center rounded-full border border-glass-border px-4 text-ink-2 transition hover:text-ink">
                {t("workshop")}
              </a>
            </li>
          </ul>
        </nav>
      </PageHeader>

      <ol className="relative mt-4 border-l border-amber/30 pl-5 sm:pl-8">
        {years.map(({ year, entries }) => (
          <li key={year} id={`y${year}`} className="scroll-mt-24 pb-10">
            <h2 className="relative mb-4 font-mono text-3xl font-bold text-amber">
              <span className="absolute top-1/2 -left-[27px] h-3 w-3 -translate-y-1/2 rounded-full bg-amber shadow-[0_0_12px_var(--color-amber)] sm:-left-[39px]" aria-hidden="true" />
              {year}
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {entries.map((entry) => (
                <li key={entry.id}>
                  {Number(entry.start.slice(0, 4)) < year && <p className="label mb-1 text-ink-3">{t("prologue")}</p>}
                  <TimelineItem entry={entry} locale={locale} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <Section id="workshop" eyebrow="L2" title={t("workshop")} intro={t("workshopIntro")}>
        <SideProjectGrid projects={getSideProjects()} locale={locale} />
        <h3 className="mt-10 mb-4 text-lg font-bold text-ink">{t("repos")}</h3>
        <RepoWall repos={getPublicRepos()} locale={locale} />
      </Section>
    </Container>
  );
}
