import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClientMessages } from "@/components/ClientMessages";
import { CvButton } from "@/components/cv/CvButton";
import { PostList } from "@/components/LibraryBlocks";
import { OfficeSection } from "@/components/office/OfficeSection";
import { FeaturedProject } from "@/components/page/Featured";
import { HomeHero } from "@/components/page/Hero";
import { SectionSplit, SectionWide } from "@/components/page/Layout";
import { ProofStrip } from "@/components/page/ProofStrip";
import { StatTicker } from "@/components/page/StatTicker";
import { TickerVisits } from "@/components/stats/TickerVisits";
import { TimelineRow } from "@/components/page/Timeline";
import { WorkRow } from "@/components/page/Work";
import { Certifications } from "@/components/certs/Certifications";
import { SkillsWall } from "@/components/ProfileBlocks";
import { DYNAMIC_STATS, getPods, getPosts, getProfile, getRoof, getSkills, getStats, getTimeline } from "@/content/load";
import { heroProofStats, moreKeyProjects, pickFeaturedPods } from "@/content/pageview";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { experienceDataVersion } from "@/experience/gate-data";
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
  const tj = await getTranslations({ locale, namespace: "journey" });
  const tl = await getTranslations({ locale, namespace: "library" });
  const ts = await getTranslations({ locale, namespace: "stats" });
  const visitsScope = `${ts("periods.all")} · ${ts("source")} · ${ts("updated")}`;
  const profile = getProfile();
  const roof = getRoof();
  const pods = getPods();
  const proof = heroProofStats(getStats(), profile.heroProof);
  const tickerStats = getStats().filter((s) => !profile.heroProof.includes(s.id));
  const featured = pickFeaturedPods(pods);
  const more = moreKeyProjects(pods, featured);
  const latest = getTimeline()
    .filter((e) => e.type === "job" || e.type === "freelance")
    .slice(-4)
    .reverse();
  const status = [
    {
      label: t("currentRole"),
      value: profile.currentRole.title[locale],
      detail: `${profile.currentRole.org}, ${t("since", { date: formatYearMonth(profile.currentRole.since, locale) })}`,
    },
    { label: t("location"), value: profile.location[locale], detail: profile.timezone },
    { label: t("openTo"), value: roof.availability[locale] },
  ];

  return (
    <ClientMessages>
      <ExperienceGate locale={locale} version={await experienceDataVersion(locale)} />
      <HomeHero locale={locale} proof={<ProofStrip stats={proof} locale={locale} label={t("proofLabel")} />} />

      <SectionWide id="work" title={t("selectedWork")} more={{ href: "/labs", label: t("allProjects", { count: pods.length }) }}>
        <ul className="hx-stack" data-testid="featured-grid">
          {featured.map((pod) => (
            <li key={pod.id} className="min-w-0">
              <FeaturedProject pod={pod} locale={locale} />
            </li>
          ))}
        </ul>
        {more.length > 0 && (
          <>
            <h3 className="pv-h3 mt-24">{t("moreWork")}</h3>
            <ul className="pv-rows pv-rows-closed mt-6">
              {more.map((pod) => (
                <WorkRow key={pod.id} pod={pod} locale={locale} />
              ))}
            </ul>
          </>
        )}
      </SectionWide>

      <section id="intro" aria-labelledby="intro-title" className="pv-wrap pv-sec-l">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 lg:col-span-7">
            <h2 id="intro-title" className="pv-h2">
              {t("introTitle")}
            </h2>
            <p className="pv-lead mt-8">{profile.bio[locale]}</p>
          </div>
          <div className="min-w-0 lg:col-span-5 lg:self-end">
            <dl className="divide-y divide-line border-y border-line">
              {status.map((row) => (
                <div key={row.label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-4">
                  <dt className="pv-meta pt-0.5">{row.label}</dt>
                  <dd className="text-ink">
                    {row.value}
                    {row.detail && <span className="pv-small block">{row.detail}</span>}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-8">
              <CvButton className="pv-btn pv-btn-ghost" testId="cv-open-intro">
                {tc("viewCv")}
              </CvButton>
            </div>
          </div>
        </div>
        <StatTicker
          stats={tickerStats}
          locale={locale}
          liveIds={Object.keys(DYNAMIC_STATS)}
          title={t("statsTitle")}
          live={t("ticker.live")}
          extra={<TickerVisits locale={locale} label={ts("tile")} live={t("ticker.live")} scope={visitsScope} />}
        />
      </section>

      <SectionWide id="journey" title={t("journeyTitle")} intro={tj("intro")} more={{ href: "/journey", label: t("fullJourney") }}>
        <ul className="pv-rows pv-rows-closed">
          {latest.map((entry) => (
            <TimelineRow key={entry.id} entry={entry} locale={locale} />
          ))}
        </ul>
      </SectionWide>

      <div className="hx-band">
        <SectionWide id="certifications" title={t("certsTitle")} className="pv-sec-s">
          <Certifications locale={locale} limit={6} />
        </SectionWide>
        <SectionSplit id="skills" title={t("skillsTitle")} className="pv-sec-s">
          <SkillsWall skills={getSkills()} locale={locale} />
        </SectionSplit>
      </div>

      <OfficeSection locale={locale} />

      <SectionWide id="writing" title={t("writingTitle")} intro={tl("intro")} more={{ href: "/library", label: t("allWriting") }}>
        <PostList posts={getPosts().slice(0, 3)} locale={locale} />
      </SectionWide>

      <section id="contact" aria-labelledby="closing-title" className="pv-wrap pv-sec-l">
        <h2 id="closing-title" className="pv-d-l max-w-[24ch] text-[length:var(--text-display-s)]">
          {roof.availability[locale]}
        </h2>
        <a
          href={`mailto:${roof.contact.email}`}
          className="pv-uline mt-8 inline-flex min-h-11 items-center font-display text-lg font-extrabold sm:text-2xl text-ink transition-colors [overflow-wrap:anywhere] [font-stretch:90%] hover:text-cyan"
        >
          {roof.contact.email}
        </a>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/contact" className="pv-btn pv-btn-ghost">
            {t("aboutContact")}
          </Link>
          <CvButton className="pv-btn pv-btn-ghost">{tc("viewCv")}</CvButton>
        </div>
      </section>
    </ClientMessages>
  );
}
