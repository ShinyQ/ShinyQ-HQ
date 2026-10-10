import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PostList, PublicationList, ResearchList, TalkList } from "@/components/LibraryBlocks";
import { PageIntro, SectionSplit, StatLedger } from "@/components/page/Layout";
import { TimelineRow } from "@/components/page/Timeline";
import { WorkRow } from "@/components/page/Work";
import { AwardList, CertificationList, SkillsWall } from "@/components/ProfileBlocks";
import { SideProjectGrid } from "@/components/WorkshopAnnex";
import { getAwards, getCertifications, getLibrary, getPods, getPosts, getProfile, getRoof, getSideProjects, getSkills, getStats, getTimeline } from "@/content/load";
import { isResearch } from "@/content/selectors";
import { assertLocale } from "@/i18n/locale";
import { formatYearMonth } from "@/lib/format";
import { cvDownloadName, cvPdfPath } from "@/lib/cv";
import { pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/quick">): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "quick" });
  return pageMetadata({ locale, path: "/quick", title: t("title"), description: t("intro") });
}

const TOC = ["profile", "stats", "software", "ai", "timeline", "skills", "projects", "certifications", "awards", "library", "contact"] as const;

export default async function QuickViewPage({ params }: PageProps<"/[locale]/quick">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "quick" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const th = await getTranslations({ locale, namespace: "home" });
  const tl = await getTranslations({ locale, namespace: "library" });
  const profile = getProfile();
  const roof = getRoof();
  const library = getLibrary();
  const timeline = getTimeline().reverse();

  const section = (id: (typeof TOC)[number]) => ({ id, title: t(id) });

  return (
    <>
      <PageIntro title={t("title")} lead={t("intro")} />
      <nav aria-labelledby="toc-title" className="pv-wrap mt-10">
        <div className="glass pv-filters overflow-x-auto px-3 py-2">
          <h2 id="toc-title" className="sr-only">
            {t("toc")}
          </h2>
          <ul className="flex gap-1.5 whitespace-nowrap">
            {TOC.map((id) => (
              <li key={id}>
                <a href={`#${id}`} className="chip min-h-11">
                  {t(id)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <SectionSplit {...section("profile")} className="!pt-16">
        <p className="pv-h3 pv-h3-l">{profile.name}</p>
        <p className="pv-lead mt-2 font-semibold">{profile.headline[locale]}</p>
        <p className="pv-small mt-2">
          {th("currentRole")}: {profile.currentRole.title[locale]} · {profile.currentRole.org} · {formatYearMonth(profile.currentRole.since, locale)}
        </p>
        <p className="pv-body mt-5">{profile.bio[locale]}</p>
        <p className="pv-body mt-4">{profile.howIWork[locale]}</p>
      </SectionSplit>

      <SectionSplit {...section("stats")}>
        <StatLedger stats={getStats()} locale={locale} />
      </SectionSplit>

      {(["software", "ai"] as const).map((wing) => (
        <SectionSplit key={wing} {...section(wing)} intro={tc(`wing.${wing}`)}>
          <ul className="pv-rows pv-rows-closed">
            {getPods(wing)
              .filter((p) => p.tier !== "listed")
              .map((pod) => (
                <WorkRow key={pod.id} pod={pod} locale={locale} />
              ))}
          </ul>
        </SectionSplit>
      ))}

      <SectionSplit {...section("timeline")}>
        <ul className="pv-rows pv-rows-closed">
          {timeline.map((entry) => (
            <TimelineRow key={entry.id} entry={entry} locale={locale} />
          ))}
        </ul>
      </SectionSplit>

      <SectionSplit {...section("skills")}>
        <SkillsWall skills={getSkills()} locale={locale} />
      </SectionSplit>

      <SectionSplit {...section("projects")}>
        <SideProjectGrid projects={getSideProjects()} locale={locale} />
      </SectionSplit>

      <SectionSplit {...section("certifications")}>
        <CertificationList certifications={getCertifications()} locale={locale} />
      </SectionSplit>

      <SectionSplit {...section("awards")}>
        <AwardList awards={getAwards()} locale={locale} />
      </SectionSplit>

      <SectionSplit {...section("library")}>
        <PostList posts={getPosts()} locale={locale} />
        <h3 className="pv-h3 mt-14 mb-4">{tl("research")}</h3>
        <ResearchList publications={library.publications} self={profile.name} contact={roof.contact} metrics={library.researchMetrics} locale={locale} />
        <h3 className="pv-h3 mt-14 mb-4">{tl("publications")}</h3>
        <PublicationList publications={library.publications.filter((p) => !isResearch(p.kind))} locale={locale} />
        <h3 className="pv-h3 mt-14 mb-4">{tl("talks")}</h3>
        <TalkList talks={library.talks} locale={locale} />
      </SectionSplit>

      <SectionSplit {...section("contact")} intro={roof.availability[locale]}>
        <ul className="flex flex-wrap gap-3">
          <li>
            <a href={`mailto:${roof.contact.email}`} className="pv-btn pv-btn-primary [overflow-wrap:anywhere]">
              {roof.contact.email}
            </a>
          </li>
          <li>
            <a href={cvPdfPath(roof.cv.fileName)} download={cvDownloadName(roof.cv.fileName)} type="application/pdf" className="pv-btn pv-btn-ghost">
              {tc("downloadCv")} (PDF)
            </a>
          </li>
        </ul>
      </SectionSplit>
    </>
  );
}
