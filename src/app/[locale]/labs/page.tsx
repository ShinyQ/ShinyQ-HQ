import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClientMessages } from "@/components/ClientMessages";
import { experienceDataVersion } from "@/experience/gate-data";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { FeaturedProject } from "@/components/page/Featured";
import { PageIntro, SectionWide } from "@/components/page/Layout";
import { WorkRow } from "@/components/page/Work";
import { WorkIndex } from "@/components/page/WorkIndex";
import { getPods } from "@/content/load";
import { isKeyProject, podAttrs } from "@/content/pageview";
import { assertLocale } from "@/i18n/locale";
import { seoMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { pageJsonLd } from "@/lib/jsonld";

export async function generateMetadata({ params }: PageProps<"/[locale]/labs">): Promise<Metadata> {
  return seoMetadata(assertLocale((await params).locale), "/labs");
}

export default async function LabsPage({ params }: PageProps<"/[locale]/labs">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "labs" });
  const tw = await getTranslations({ locale, namespace: "work" });
  const all = getPods();
  // Key projects are the hero pods with screenshots (owner request 2026-10-15); the rest stay in the index.
  const heroes = [...getPods("ai"), ...getPods("software")].filter(isKeyProject);
  const keyIds = new Set(heroes.map((p) => p.id));
  const rest = all.filter((p) => !keyIds.has(p.id));

  return (
    <ClientMessages>
      <JsonLd data={pageJsonLd(locale, "/labs")} />
      <ExperienceGate locale={locale} version={await experienceDataVersion(locale)} startFloor="L3" />
      <PageIntro
        title={tw("title")}
        lead={t("intro")}
        aside={
          <dl className="grid grid-cols-3 gap-x-4 border-t border-line lg:grid-cols-1">
            {(["ai", "data", "software"] as const).map((wing) => (
              // Three wings as ruled facts (no tiles): a column each up to tablets, then one row per wing in the narrow aside (count left, name and intro right).
              <div key={wing} className="min-w-0 pt-4 lg:grid lg:grid-cols-[4rem_minmax(0,1fr)] lg:items-center lg:gap-x-4 lg:border-b lg:border-line lg:py-4">
                {/* Two lines reserved below lg: "Product Engineering" wraps on phones, and the counts stay aligned. */}
                <dt className="min-h-[2lh] font-semibold text-ink lg:col-start-2 lg:row-start-1 lg:min-h-0">{tw(`wingShort.${wing}`)}</dt>
                <dd className="pv-num mt-2 text-[40px] leading-none lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-0">{all.filter((p) => p.wing === wing).length}</dd>
                <dd className="pv-small mt-1.5 hidden sm:block lg:col-start-2 lg:row-start-2">{t(`${wing}Intro`)}</dd>
              </div>
            ))}
          </dl>
        }
      />
      <WorkIndex pods={all.map(({ wing, stack }) => ({ wing, stack }))}>
        <div data-pod-block>
          {/* Key projects as a Feature Stack, one project a row (decision 2026-10-27), like the landing's Selected work. */}
          <SectionWide id="key-projects" title={tw("keyProjects")} className="pv-sec-s">
            <ul className="hx-stack">
              {heroes.map((pod) => (
                <li key={pod.id} {...podAttrs(pod)} className="min-w-0">
                  <FeaturedProject pod={pod} locale={locale} stack />
                </li>
              ))}
            </ul>
          </SectionWide>
        </div>
        <div data-pod-block>
          <SectionWide id="all-projects" title={tw("allProjects")}>
            <ul className="pv-rows pv-rows-closed">
              {rest.map((pod) => (
                <WorkRow key={pod.id} pod={pod} locale={locale} />
              ))}
            </ul>
          </SectionWide>
        </div>
      </WorkIndex>
    </ClientMessages>
  );
}
