import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PostList, PublicationList, TalkList } from "@/components/LibraryBlocks";
import { MetricTile } from "@/components/MetricTile";
import { Monogram } from "@/components/Monogram";
import { PodCard } from "@/components/PodCard";
import { AwardList, CertificationList, SkillsWall } from "@/components/ProfileBlocks";
import { Container, PageHeader, Section } from "@/components/Section";
import { TimelineItem } from "@/components/TimelineItem";
import { SideProjectGrid } from "@/components/WorkshopAnnex";
import { getAwards, getCertifications, getLibrary, getPods, getPosts, getProfile, getRoof, getSideProjects, getSkills, getStats, getTimeline } from "@/content/load";
import { LOCALES } from "@/content/schema";
import { assertLocale } from "@/i18n/locale";
import { formatYearMonth } from "@/lib/format";
import { cvPdfPath, pageMetadata } from "@/lib/site";

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

  return (
    <Container>
      <PageHeader eyebrow="ShinyQ HQ" title={t("title")} intro={t("intro")} />
      <nav aria-labelledby="toc-title" className="glass z-20 -mx-1 mt-2 overflow-x-auto px-3 py-2 sm:sticky sm:top-[76px]">
        <h2 id="toc-title" className="sr-only">
          {t("toc")}
        </h2>
        <ul className="flex gap-1 whitespace-nowrap">
          {TOC.map((id) => (
            <li key={id}>
              <a href={`#${id}`} className="inline-flex min-h-11 items-center rounded-md px-2.5 text-sm text-ink-2 transition hover:bg-white/5 hover:text-ink">
                {t(id)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="profile" title={t("profile")}>
        <div className="glass flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
          <Monogram text={profile.monogram} size={88} label={profile.name} />
          <div>
            <p className="text-xl font-bold text-ink">{profile.name}</p>
            <p className="font-semibold text-cyan">{profile.headline[locale]}</p>
            <p className="mt-1 text-sm text-ink-2">
              {th("currentRole")}: {profile.currentRole.title[locale]} · {profile.currentRole.org} · {formatYearMonth(profile.currentRole.since, locale)}
            </p>
            <p className="mt-3 leading-7 text-ink-2">{profile.bio[locale]}</p>
            <p className="mt-3 leading-7 text-ink-2">{profile.howIWork[locale]}</p>
          </div>
        </div>
      </Section>

      <Section id="stats" title={t("stats")}>
        <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
          {getStats().map((s) => (
            <li key={s.id}>
              <MetricTile value={s.value} label={s.label} confidence={s.confidence} locale={locale} />
            </li>
          ))}
        </ul>
      </Section>

      {(["software", "ai"] as const).map((wing) => (
        <Section key={wing} id={wing} eyebrow={`L3 · ${tc(`wing.${wing}`)}`} title={t(wing)}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {getPods(wing)
              .filter((p) => p.tier !== "listed")
              .map((pod) => (
                <li key={pod.id}>
                  <PodCard pod={pod} locale={locale} />
                </li>
              ))}
          </ul>
        </Section>
      ))}

      <Section id="timeline" eyebrow="L2" title={t("timeline")}>
        <ul className="grid gap-3 md:grid-cols-2">
          {timeline.map((entry) => (
            <li key={entry.id}>
              <TimelineItem entry={entry} locale={locale} />
            </li>
          ))}
        </ul>
      </Section>

      <Section id="skills" eyebrow="L1" title={t("skills")}>
        <SkillsWall skills={getSkills()} locale={locale} />
      </Section>

      <Section id="projects" eyebrow="L2" title={t("projects")}>
        <SideProjectGrid projects={getSideProjects()} locale={locale} />
      </Section>

      <Section id="certifications" eyebrow="L1" title={t("certifications")}>
        <CertificationList certifications={getCertifications()} locale={locale} />
      </Section>

      <Section id="awards" eyebrow="L2" title={t("awards")}>
        <AwardList awards={getAwards()} locale={locale} />
      </Section>

      <Section id="library" eyebrow="L4" title={t("library")}>
        <PostList posts={getPosts()} locale={locale} />
        <h3 className="mt-8 mb-3 font-bold text-ink">{tl("publications")}</h3>
        <PublicationList publications={library.publications} locale={locale} />
        <h3 className="mt-8 mb-3 font-bold text-ink">{tl("talks")}</h3>
        <TalkList talks={library.talks} locale={locale} />
      </Section>

      <Section id="contact" eyebrow="RF" title={t("contact")} intro={roof.availability[locale]}>
        <ul className="flex flex-wrap gap-3">
          <li>
            <a href={`mailto:${roof.contact.email}`} className="inline-flex min-h-11 items-center rounded-lg bg-cyan px-5 font-semibold text-void">
              {roof.contact.email}
            </a>
          </li>
          {LOCALES.map((l) => (
            <li key={l}>
              <a href={cvPdfPath(roof.cv.fileName, l)} hrefLang={l} className="inline-flex min-h-11 items-center rounded-lg border border-glass-border px-5 font-semibold text-ink">
                {tc("downloadCvLocale", { locale: l.toUpperCase() })}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </Container>
  );
}
