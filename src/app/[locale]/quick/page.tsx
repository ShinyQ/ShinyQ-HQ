import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CvButton } from "@/components/cv/CvButton";
import { PostList } from "@/components/LibraryBlocks";
import { PageIntro, SectionSplit, StatLedger } from "@/components/page/Layout";
import { TimelineRow } from "@/components/page/Timeline";
import { WorkRow } from "@/components/page/Work";
import { Certifications } from "@/components/certs/Certifications";
import { AwardList, SkillsWall } from "@/components/ProfileBlocks";
import { SideProjectGrid } from "@/components/WorkshopAnnex";
import { getAwards, getPods, getPosts, getProfile, getRoof, getSideProjects, getSkills, getStats, getTimeline } from "@/content/load";
import { assertLocale } from "@/i18n/locale";
import { formatYearMonth } from "@/lib/format";
import { seoMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { pageJsonLd } from "@/lib/jsonld";

export async function generateMetadata({ params }: PageProps<"/[locale]/quick">): Promise<Metadata> {
  return seoMetadata(assertLocale((await params).locale), "/quick");
}

const TOC = ["profile", "stats", "software", "ai", "data", "timeline", "skills", "projects", "certifications", "awards", "library", "contact"] as const;

/**
 * The 60-second brief (owner decision 2026-11-01): each list shows its first rows and links to the full page, so a
 * recruiter on a phone reads the whole page and the contact line sits in the profile at the top.
 */
const WING_ROWS = 3;
const ROLE_ROWS = 6;
const SIDE_ROWS = 3;
const POST_ROWS = 3;
const CERT_ROWS = 3;

export default async function QuickViewPage({ params }: PageProps<"/[locale]/quick">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "quick" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const th = await getTranslations({ locale, namespace: "home" });
  const profile = getProfile();
  const roof = getRoof();
  // The latest roles only (jobs and freelance), newest first; the rest of the timeline lives on Journey.
  const roles = getTimeline()
    .filter((e) => e.type === "job" || e.type === "freelance")
    .reverse()
    .slice(0, ROLE_ROWS);
  const sideProjects = getSideProjects();

  const section = (id: (typeof TOC)[number]) => ({ id, title: t(id) });

  return (
    <>
      <JsonLd data={pageJsonLd(locale, "/quick")} />
      <PageIntro title={t("title")} lead={t("intro")} />
      <nav aria-labelledby="toc-title" className="pv-wrap mt-10">
        <div className="pv-filters overflow-x-auto px-3 py-2">
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

      <SectionSplit {...section("profile")} className="pv-sec !pt-16">
        <p className="pv-h3 pv-h3-l">{profile.name}</p>
        <p className="pv-lead mt-2 font-semibold">{profile.headline[locale]}</p>
        <p className="pv-small mt-2">
          {th("currentRole")}: {profile.currentRole.title[locale]}, {profile.currentRole.org}, {formatYearMonth(profile.currentRole.since, locale)}
        </p>
        <p className="pv-small mt-2 text-ink-2" data-testid="quick-contact">
          {roof.availability[locale]}{" "}
          <a href={`mailto:${roof.contact.email}`} className="pv-uline text-ink transition-colors [overflow-wrap:anywhere] hover:text-cyan">
            {roof.contact.email}
          </a>
        </p>
        <div className="mt-6">
          <CvButton className="pv-btn pv-btn-ghost" testId="cv-open-quick">
            {tc("viewCv")}
          </CvButton>
        </div>
        <p className="pv-body mt-5">{profile.bio[locale]}</p>
        <p className="pv-body mt-4">{profile.howIWork[locale]}</p>
      </SectionSplit>

      <SectionSplit {...section("stats")}>
        <StatLedger stats={getStats()} locale={locale} />
      </SectionSplit>

      {(["software", "ai", "data"] as const).map((wing) => {
        const pods = getPods(wing);
        return (
          <SectionSplit key={wing} {...section(wing)} intro={tc(`wing.${wing}`)} more={{ href: `/labs?wing=${wing}`, label: t("allIn", { count: pods.length, wing: tc(`wing.${wing}`) }) }}>
            <ul className="pv-rows pv-rows-closed">
              {pods.slice(0, WING_ROWS).map((pod) => (
                <WorkRow key={pod.id} pod={pod} locale={locale} />
              ))}
            </ul>
          </SectionSplit>
        );
      })}

      <SectionSplit {...section("timeline")} more={{ href: "/journey", label: th("fullJourney") }}>
        <ul className="pv-rows pv-rows-closed">
          {roles.map((entry) => (
            <TimelineRow key={entry.id} entry={entry} locale={locale} />
          ))}
        </ul>
      </SectionSplit>

      <SectionSplit {...section("skills")}>
        <SkillsWall skills={getSkills()} locale={locale} />
      </SectionSplit>

      <SectionSplit {...section("projects")} more={{ href: "/journey#workshop", label: t("allSide", { count: sideProjects.length }) }}>
        <SideProjectGrid projects={sideProjects.slice(0, SIDE_ROWS)} locale={locale} />
      </SectionSplit>

      <SectionSplit {...section("certifications")}>
        <Certifications locale={locale} limit={CERT_ROWS} />
      </SectionSplit>

      <SectionSplit {...section("awards")}>
        <AwardList awards={getAwards()} locale={locale} />
      </SectionSplit>

      <SectionSplit {...section("library")} more={{ href: "/library", label: th("allWriting") }}>
        <PostList posts={getPosts().slice(0, POST_ROWS)} locale={locale} />
      </SectionSplit>

      <SectionSplit {...section("contact")} intro={roof.availability[locale]}>
        <ul className="flex flex-wrap gap-3">
          <li>
            <a href={`mailto:${roof.contact.email}`} className="pv-btn pv-btn-primary [overflow-wrap:anywhere]">
              {roof.contact.email}
            </a>
          </li>
          <li>
            <CvButton className="pv-btn pv-btn-ghost">{tc("viewCv")}</CvButton>
          </li>
        </ul>
      </SectionSplit>
    </>
  );
}
