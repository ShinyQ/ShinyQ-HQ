import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClientMessages } from "@/components/ClientMessages";
import { CvButton } from "@/components/cv/CvButton";
import { ContactPanel } from "@/components/page/About";
import { Marker, SectionSplit } from "@/components/page/Layout";
import { Certifications } from "@/components/certs/Certifications";
import { PrincipleGrid, SkillsWall } from "@/components/ProfileBlocks";
import { Portrait } from "@/components/page/Portrait";
import { ProductionSection } from "@/components/page/Production";
import { VisitsSection } from "@/components/stats/VisitsSection";
import { getProfile, getRoof, getSkills } from "@/content/load";
import { experienceDataVersion } from "@/experience/gate-data";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { assertLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { seoMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { pageJsonLd } from "@/lib/jsonld";

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">): Promise<Metadata> {
  return seoMetadata(assertLocale((await params).locale), "/contact");
}

/** First sentences as the lead, the rest as body copy. */
function splitStory(text: string, sentences = 2): [string, string] {
  const parts = text.split(/(?<=\.)\s+/);
  return [parts.slice(0, sentences).join(" "), parts.slice(sentences).join(" ")];
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "contact" });
  const ta = await getTranslations({ locale, namespace: "about" });
  const th = await getTranslations({ locale, namespace: "home" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const tq = await getTranslations({ locale, namespace: "quick" });
  const tf = await getTranslations({ locale, namespace: "floors" });
  const tn = await getTranslations({ locale, namespace: "nav" });
  const roof = getRoof();
  const profile = getProfile();
  const [lead, rest] = splitStory(profile.story[locale]);

  return (
    <ClientMessages>
      <JsonLd data={pageJsonLd(locale, "/contact")} />
      <ExperienceGate locale={locale} version={await experienceDataVersion(locale)} startFloor="RF" />
      <header className="pv-wrap grid gap-10 pt-8 sm:pt-12 lg:grid-cols-12 lg:gap-6 lg:pt-16">
        <div className="min-w-0 lg:col-span-7">
          <p className="pv-data mb-5">
            <Marker accent="blue">RF · {tf("RF")}</Marker>
          </p>
          <div className="flex items-center gap-4 sm:gap-5">
            <Portrait name={profile.name} size={112} sizes="(min-width: 640px) 112px, 80px" className="size-20 sm:size-28" />
            <h1 className="pv-d-l">{ta("title")}</h1>
          </div>
          <p className="pv-lead mt-6">{lead}</p>
          {rest && <p className="pv-body mt-4">{rest}</p>}
          <p className="mt-4">
            <Link href="/build" className="pv-go">
              {tn("build")}
            </Link>
          </p>
        </div>
        <div className="min-w-0 lg:col-span-4 lg:col-start-9 lg:pt-12">
          <ContactPanel roof={roof} profile={profile} locale={locale} />
        </div>
      </header>

      <SectionSplit id="how" title={th("howTitle")} intro={profile.howIWork[locale]}>
        <PrincipleGrid principles={profile.principles} locale={locale} />
      </SectionSplit>

      <ProductionSection locale={locale} />

      <SectionSplit id="skills" title={tq("skills")}>
        <SkillsWall skills={getSkills()} locale={locale} />
      </SectionSplit>

      <SectionSplit id="certifications" title={th("certsTitle")}>
        <Certifications locale={locale} />
      </SectionSplit>

      <VisitsSection locale={locale} />

      <SectionSplit id="cv" title={t("cvTitle")} intro={t("cvIntro")}>
        <ul className="flex flex-wrap items-center gap-3">
          <li>
            <CvButton className="pv-btn pv-btn-primary">{tc("viewCv")}</CvButton>
          </li>
          <li>
            <Link href="/cv" className="pv-go ml-2">
              /{locale}/cv
            </Link>
          </li>
        </ul>
      </SectionSplit>
    </ClientMessages>
  );
}
