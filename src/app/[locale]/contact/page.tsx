import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContactPanel } from "@/components/page/About";
import { Marker, SectionSplit } from "@/components/page/Layout";
import { CertificationList, PrincipleGrid, SkillsWall } from "@/components/ProfileBlocks";
import { getCertifications, getProfile, getRoof, getSkills } from "@/content/load";
import { experienceDataFor } from "@/experience/gate-data";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { assertLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { cvDownloadName, cvPdfPath } from "@/lib/cv";
import { pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "about" });
  return pageMetadata({ locale, path: "/contact", title: t("title"), description: getRoof().availability[locale] });
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
  const roof = getRoof();
  const profile = getProfile();
  const [lead, rest] = splitStory(profile.story[locale]);

  return (
    <>
      <ExperienceGate data={await experienceDataFor(locale)} startFloor="RF" />
      <header className="pv-wrap grid gap-10 pt-8 sm:pt-12 lg:grid-cols-12 lg:gap-6 lg:pt-16">
        <div className="min-w-0 lg:col-span-7">
          <p className="pv-data mb-5">
            <Marker accent="blue">RF · {tf("RF")}</Marker>
          </p>
          <h1 className="pv-d-l">{ta("title")}</h1>
          <p className="pv-lead mt-6">{lead}</p>
          {rest && <p className="pv-body mt-4">{rest}</p>}
        </div>
        <div className="min-w-0 lg:col-span-4 lg:col-start-9 lg:pt-12">
          <ContactPanel roof={roof} profile={profile} locale={locale} />
        </div>
      </header>

      <SectionSplit id="how" title={th("howTitle")} intro={profile.howIWork[locale]}>
        <PrincipleGrid principles={profile.principles} locale={locale} />
      </SectionSplit>

      <SectionSplit id="skills" title={tq("skills")}>
        <SkillsWall skills={getSkills()} locale={locale} />
      </SectionSplit>

      <SectionSplit id="certifications" title={th("certsTitle")}>
        <CertificationList certifications={getCertifications()} locale={locale} />
      </SectionSplit>

      <SectionSplit id="cv" title={t("cvTitle")} intro={t("cvIntro")}>
        <ul className="flex flex-wrap items-center gap-3">
          <li>
            <a href={cvPdfPath(roof.cv.fileName)} download={cvDownloadName(roof.cv.fileName)} type="application/pdf" className="pv-btn pv-btn-primary">
              {tc("downloadCv")} (PDF)
            </a>
          </li>
          <li>
            <Link href="/cv" className="pv-go ml-2">
              /{locale}/cv
            </Link>
          </li>
        </ul>
      </SectionSplit>
    </>
  );
}
