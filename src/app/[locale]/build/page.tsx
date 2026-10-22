import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExternalLink } from "@/components/ExternalLink";
import { JsonLd } from "@/components/JsonLd";
import { AgentsSection, BlueprintSection, BrainSection, DashboardSection, GatesSection, RejectedSection, TimelineSection } from "@/components/build/BuildSections";
import { PageIntro } from "@/components/page/Layout";
import { STATION_IDS, getBuildFacts, getBuildStory } from "@/content/build-story";
import { assertLocale } from "@/i18n/locale";
import { formatDate } from "@/lib/format";
import { pageJsonLd } from "@/lib/jsonld";
import { seoMetadata } from "@/lib/seo";
import { REPO_URL } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/build">): Promise<Metadata> {
  return seoMetadata(assertLocale((await params).locale), "/build");
}

/** How this site was built: the build story (content/build-story.json) with the measured facts snapshot. */
export default async function BuildPage({ params }: PageProps<"/[locale]/build">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "build" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const story = getBuildStory();
  const facts = getBuildFacts();
  const date = formatDate(facts.generatedAt, locale);
  const toc = STATION_IDS.map((id) => ({ id, label: story.stations[id].title[locale] }));

  return (
    <>
      <JsonLd data={pageJsonLd(locale, "/build")} />
      <PageIntro title={story.title[locale]} lead={story.lead[locale]}>
        {/* Plain text: a pull request build snapshots GitHub's merge ref, whose sha is not a public commit. */}
        <p className="pv-small mt-6">{facts.commit ? t("snapshot", { date, commit: facts.commit }) : t("snapshotDate", { date })}</p>
        <p className="mt-3">
          <ExternalLink href={REPO_URL} className="pv-uline inline-flex min-h-11 items-center text-sm font-semibold text-ink hover:text-cyan" srHint={tc("external")}>
            {t("source")}
          </ExternalLink>
        </p>
      </PageIntro>
      <nav aria-labelledby="toc-title" className="pv-wrap mt-10">
        <div className="pv-filters overflow-x-auto px-3 py-2">
          <h2 id="toc-title" className="sr-only">
            {t("toc")}
          </h2>
          <ul className="flex gap-1.5 whitespace-nowrap">
            {toc.map(({ id, label }) => (
              <li key={id}>
                <a href={`#${id}`} className="chip min-h-11">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <BlueprintSection locale={locale} />
      <TimelineSection locale={locale} />
      <AgentsSection locale={locale} />
      <GatesSection locale={locale} />
      <DashboardSection locale={locale} />
      <BrainSection locale={locale} />
      <RejectedSection locale={locale} />
    </>
  );
}
