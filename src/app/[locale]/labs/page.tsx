import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { experienceDataFor } from "@/experience/gate-data";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { Marker, PageIntro, SectionWide } from "@/components/page/Layout";
import { WorkFeature, WorkRow } from "@/components/page/Work";
import { WorkIndex } from "@/components/page/WorkIndex";
import { getPods } from "@/content/load";
import { podAttrs } from "@/content/pageview";
import { assertLocale } from "@/i18n/locale";
import { WING_ACCENT } from "@/lib/accent";
import { pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/labs">): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "labs" });
  const tw = await getTranslations({ locale, namespace: "work" });
  return pageMetadata({ locale, path: "/labs", title: tw("title"), description: t("intro") });
}

/** Alternating 7/5 and 5/7 column spans for the key projects grid. */
const SPANS = ["lg:col-span-7", "lg:col-span-5", "lg:col-span-5", "lg:col-span-7"];

export default async function LabsPage({ params }: PageProps<"/[locale]/labs">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "labs" });
  const tw = await getTranslations({ locale, namespace: "work" });
  const tf = await getTranslations({ locale, namespace: "floors" });
  const all = getPods();
  const heroes = [...getPods("ai"), ...getPods("software")].filter((p) => p.tier === "hero");
  const rest = all.filter((p) => p.tier !== "hero");

  return (
    <>
      <ExperienceGate data={await experienceDataFor(locale)} startFloor="L3" />
      <PageIntro
        marker={<Marker accent="violet">L3 · {tf("L3")}</Marker>}
        title={tw("title")}
        lead={t("intro")}
        aside={
          <dl className="grid grid-cols-2 gap-3">
            {(["ai", "software"] as const).map((wing) => (
              <div key={wing} className="card p-4">
                <dt className="pv-data">
                  <Marker accent={WING_ACCENT[wing]}>{tw(`wingShort.${wing}`)}</Marker>
                </dt>
                <dd className="pv-num mt-3 text-[36px]">{all.filter((p) => p.wing === wing).length}</dd>
                <dd className="pv-small mt-1 hidden sm:block">{t(`${wing}Intro`)}</dd>
              </div>
            ))}
          </dl>
        }
      />
      <WorkIndex pods={all.map(({ wing, stack }) => ({ wing, stack }))}>
        <div data-pod-block>
          <SectionWide id="key-projects" title={tw("keyProjects")} className="!pt-14">
            <ul className="grid gap-x-6 gap-y-14 lg:grid-cols-12">
              {heroes.map((pod, i) => (
                <li key={pod.id} {...podAttrs(pod)} className={SPANS[i % SPANS.length]}>
                  <WorkFeature pod={pod} locale={locale} size="grid" />
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
    </>
  );
}
