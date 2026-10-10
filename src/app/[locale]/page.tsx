import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PostList } from "@/components/LibraryBlocks";
import { SectionSplit, SectionWide, StatLedger } from "@/components/page/Layout";
import { TimelineRow } from "@/components/page/Timeline";
import { WorkFeature, WorkRow } from "@/components/page/Work";
import { CertificationList, SkillsWall } from "@/components/ProfileBlocks";
import { buildExperienceData } from "@/content/experience";
import { getCertifications, getPods, getPosts, getProfile, getRoof, getSkills, getStats, getTimeline } from "@/content/load";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { assertLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { formatYearMonth } from "@/lib/format";
import { cvDownloadName, cvPdfPath } from "@/lib/cv";
import { pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  return pageMetadata({ locale, path: "/" });
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const tf = await getTranslations({ locale, namespace: "floors" });
  const tj = await getTranslations({ locale, namespace: "journey" });
  const tl = await getTranslations({ locale, namespace: "library" });
  const profile = getProfile();
  const roof = getRoof();
  const [lead, ...pair] = getPods("ai").filter((p) => p.tier === "hero");
  const software = getPods("software").filter((p) => p.tier === "hero");
  const latest = getTimeline()
    .filter((e) => e.type === "job" || e.type === "freelance")
    .slice(-4)
    .reverse();
  const experience = buildExperienceData(locale, { L1: tf("L1"), L2: tf("L2"), L3: tf("L3"), L4: tf("L4"), RF: tf("RF") });
  const cv = cvPdfPath(roof.cv.fileName);
  const cvName = cvDownloadName(roof.cv.fileName);

  return (
    <>
      <ExperienceGate data={experience} />
      <section aria-labelledby="hero-title" className="pv-wrap grid gap-10 pt-10 sm:pt-16 lg:grid-cols-12 lg:gap-6 lg:pt-24">
        <div className="min-w-0 lg:col-span-8">
          <h1 id="hero-title" className="pv-d-xl">
            {profile.name}
          </h1>
          <p className="pv-lead mt-8 font-semibold">{profile.headline[locale]}</p>
          <p className="pv-lead mt-1">{profile.subheadline[locale]}</p>
          <p className="pv-body mt-5">{profile.bio[locale]}</p>
        </div>
        <aside aria-label={t("statusLabel")} className="card self-end p-5 sm:p-6 lg:col-span-4">
          <dl className="divide-y divide-line">
            {[
              {
                label: t("currentRole"),
                value: profile.currentRole.title[locale],
                detail: `${profile.currentRole.org} · ${t("since", { date: formatYearMonth(profile.currentRole.since, locale) })}`,
              },
              { label: t("location"), value: profile.location[locale], detail: profile.timezone },
              { label: t("openTo"), value: roof.availability[locale] },
            ].map((row) => (
              <div key={row.label} className="grid grid-cols-[92px_1fr] gap-3 py-3.5 first:pt-0">
                <dt className="pv-data pt-1">{row.label}</dt>
                <dd className="text-[15px] leading-[22px] text-ink">
                  {row.value}
                  {row.detail && <span className="block text-sm text-ink-2">{row.detail}</span>}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Link href="/labs" className="pv-btn pv-btn-primary">
              {t("seeWork")}
            </Link>
            <a href={cv} download={cvName} type="application/pdf" className="pv-btn pv-btn-ghost">
              {tc("downloadCv")}
            </a>
          </div>
        </aside>
      </section>

      <SectionSplit id="stats" title={t("statsTitle")}>
        <StatLedger stats={getStats()} locale={locale} />
      </SectionSplit>

      <SectionWide id="work" title={t("selectedWork")} more={{ href: "/labs", label: t("allProjects", { count: getPods().length }) }}>
        <div className="grid gap-x-6 gap-y-14 lg:grid-cols-12">
          {lead && (
            <div className="lg:col-span-7">
              <WorkFeature pod={lead} locale={locale} size="lead" />
            </div>
          )}
          <div className="flex flex-col gap-12 lg:col-span-5">
            {pair.map((pod) => (
              <WorkFeature key={pod.id} pod={pod} locale={locale} size="pair" />
            ))}
          </div>
        </div>
        <ul className="pv-rows pv-rows-closed mt-16">
          {software.map((pod) => (
            <WorkRow key={pod.id} pod={pod} locale={locale} />
          ))}
        </ul>
      </SectionWide>

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
        <CertificationList certifications={getCertifications()} locale={locale} />
      </SectionSplit>

      <section aria-labelledby="closing-title" className="pv-wrap pv-sec">
        <h2 id="closing-title" className="pv-d-l max-w-[18ch] text-[clamp(34px,4.6vw,64px)]">
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
          <a href={cv} download={cvName} type="application/pdf" className="pv-btn pv-btn-ghost">
            {tc("downloadCv")} (PDF)
          </a>
        </div>
      </section>
    </>
  );
}
