import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClientMessages } from "@/components/ClientMessages";
import { CvButton } from "@/components/cv/CvButton";
import { PostList } from "@/components/LibraryBlocks";
import { FeaturedProject } from "@/components/page/Featured";
import { HomeHero } from "@/components/page/Hero";
import { SectionSplit, SectionWide } from "@/components/page/Layout";
import { StatTicker } from "@/components/page/StatTicker";
import { TickerVisits } from "@/components/stats/TickerVisits";
import { TimelineRow } from "@/components/page/Timeline";
import { WorkRow } from "@/components/page/Work";
import { Certifications } from "@/components/certs/Certifications";
import { SkillsWall } from "@/components/ProfileBlocks";
import { buildExperienceData } from "@/content/experience";
import { DYNAMIC_STATS, getPods, getPosts, getProfile, getRoof, getSkills, getStats, getTimeline } from "@/content/load";
import { moreKeyProjects, pickFeaturedPods } from "@/content/pageview";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { assertLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { formatYearMonth } from "@/lib/format";
import { seoMetadata } from "@/lib/seo";
import { searchVerification } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const verification = searchVerification();
  return { ...seoMetadata(assertLocale((await params).locale), "/"), ...(verification ? { verification } : {}) };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const tf = await getTranslations({ locale, namespace: "floors" });
  const tj = await getTranslations({ locale, namespace: "journey" });
  const tl = await getTranslations({ locale, namespace: "library" });
  const ts = await getTranslations({ locale, namespace: "stats" });
  const visitsScope = `${ts("window.d30")} · ${ts("source")} · ${ts("updated")}`;
  const profile = getProfile();
  const roof = getRoof();
  const pods = getPods();
  const featured = pickFeaturedPods(pods);
  const more = moreKeyProjects(pods, featured);
  const latest = getTimeline()
    .filter((e) => e.type === "job" || e.type === "freelance")
    .slice(-4)
    .reverse();
  const experience = buildExperienceData(locale, { L1: tf("L1"), L2: tf("L2"), L3: tf("L3"), L4: tf("L4"), RF: tf("RF") });
  const status = [
    {
      label: t("currentRole"),
      value: profile.currentRole.title[locale],
      detail: `${profile.currentRole.org} · ${t("since", { date: formatYearMonth(profile.currentRole.since, locale) })}`,
    },
    { label: t("location"), value: profile.location[locale], detail: profile.timezone },
    { label: t("openTo"), value: roof.availability[locale] },
  ];

  return (
    <ClientMessages>
      <ExperienceGate data={experience} />
      <HomeHero
        locale={locale}
        ticker={
          <StatTicker
            stats={getStats()}
            locale={locale}
            liveIds={Object.keys(DYNAMIC_STATS)}
            title={t("statsTitle")}
            live={t("ticker.live")}
            extra={(copy) => <TickerVisits locale={locale} label={ts("tile")} live={t("ticker.live")} scope={visitsScope} copy={copy} />}
          />
        }
      />

      <SectionWide id="work" title={t("selectedWork")} more={{ href: "/labs", label: t("allProjects", { count: pods.length }) }}>
        <ul className="grid gap-x-6 gap-y-10 md:auto-rows-fr md:grid-cols-2 lg:grid-cols-3" data-testid="featured-grid">
          {featured.map((pod) => (
            <li key={pod.id} className="min-w-0">
              <FeaturedProject pod={pod} locale={locale} />
            </li>
          ))}
        </ul>
        {more.length > 0 && (
          <>
            <h3 className="pv-data mt-16">{t("moreWork")}</h3>
            <ul className="pv-rows pv-rows-closed mt-4">
              {more.map((pod) => (
                <WorkRow key={pod.id} pod={pod} locale={locale} />
              ))}
            </ul>
          </>
        )}
      </SectionWide>

      <SectionSplit id="intro" title={t("introTitle")}>
        <p className="pv-lead">{profile.bio[locale]}</p>
        <dl className="mt-8 divide-y divide-line border-y border-line">
          {status.map((row) => (
            <div key={row.label} className="grid grid-cols-[120px_1fr] gap-3 py-4">
              <dt className="pv-data pt-1">{row.label}</dt>
              <dd className="text-[15px] leading-[22px] text-ink">
                {row.value}
                {row.detail && <span className="block text-sm text-ink-2">{row.detail}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-8">
          <CvButton className="pv-btn pv-btn-ghost" testId="cv-open-hero">
            {tc("viewCv")}
          </CvButton>
        </div>
      </SectionSplit>

      <SectionSplit id="journey" title={t("journeyTitle")} intro={tj("intro")} more={{ href: "/journey", label: t("fullJourney") }}>
        <ul className="pv-rows pv-rows-closed">
          {latest.map((entry) => (
            <TimelineRow key={entry.id} entry={entry} locale={locale} />
          ))}
        </ul>
      </SectionSplit>

      <SectionSplit id="writing" title={t("writingTitle")} intro={tl("intro")} more={{ href: "/library", label: t("allWriting") }}>
        <PostList posts={getPosts().slice(0, 3)} locale={locale} />
      </SectionSplit>

      <SectionSplit id="skills" title={t("skillsTitle")}>
        <SkillsWall skills={getSkills()} locale={locale} />
      </SectionSplit>

      <SectionSplit id="certifications" title={t("certsTitle")}>
        <Certifications locale={locale} limit={6} />
      </SectionSplit>

      <section id="contact" aria-labelledby="closing-title" className="pv-wrap pv-sec">
        <h2 id="closing-title" className="pv-d-l max-w-[22ch] text-[clamp(30px,3.2vw,44px)] leading-[1.02]">
          {roof.availability[locale]}
        </h2>
        <a
          href={`mailto:${roof.contact.email}`}
          className="mt-7 inline-block font-display text-[clamp(20px,2.2vw,30px)] font-semibold text-ink underline decoration-line-2 decoration-1 underline-offset-8 transition [overflow-wrap:anywhere] [font-stretch:90%] hover:text-cyan hover:decoration-cyan"
        >
          {roof.contact.email}
        </a>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/contact" className="pv-btn pv-btn-ghost">
            {t("aboutContact")}
          </Link>
          <CvButton className="pv-btn pv-btn-ghost">{tc("viewCv")}</CvButton>
        </div>
      </section>
    </ClientMessages>
  );
}
