import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MetricTile } from "@/components/MetricTile";
import { Monogram } from "@/components/Monogram";
import { PodCard } from "@/components/PodCard";
import { Container, Section } from "@/components/Section";
import { TimelineItem } from "@/components/TimelineItem";
import { CertificationList, PrincipleGrid, SkillsWall } from "@/components/ProfileBlocks";
import { getCertifications, getPods, getProfile, getRoof, getSkills, getStats, getTimeline } from "@/content/load";
import { assertLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { ACCENT_TEXT, FLOOR_ACCENT, WING_ACCENT } from "@/lib/accent";
import { formatYearMonth } from "@/lib/format";
import { cvPdfPath, pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  return pageMetadata({ locale, path: "/" });
}

const DIRECTORY = [
  { floor: "RF", href: "/contact" },
  { floor: "L4", href: "/library" },
  { floor: "L3", href: "/labs" },
  { floor: "L2", href: "/journey" },
  { floor: "L1", href: "/" },
] as const;

export default async function LobbyPage({ params }: PageProps<"/[locale]">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const tf = await getTranslations({ locale, namespace: "floors" });
  const profile = getProfile();
  const roof = getRoof();
  const wings = (["software", "ai"] as const).map((wing) => ({
    wing,
    pods: getPods(wing).filter((p) => p.tier === "hero"),
  }));
  const latest = getTimeline()
    .filter((e) => e.type === "job" || e.type === "freelance")
    .slice(-4)
    .reverse();

  return (
    <Container>
      <section aria-labelledby="hero-title" className="grid gap-8 pt-10 pb-6 sm:pt-16 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="label mb-4 text-green">{t("eyebrow")}</p>
          <div className="flex items-center gap-4">
            <Monogram text={profile.monogram} size={72} />
            <div>
              <h1 id="hero-title" className="text-[30px] leading-[36px] font-extrabold tracking-tight text-ink sm:text-[40px] sm:leading-[46px]">
                {profile.name}
              </h1>
              <p className="mt-1 text-lg font-semibold text-cyan sm:text-xl">{profile.headline[locale]}</p>
            </div>
          </div>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-ink">{profile.subheadline[locale]}</p>
          <p className="mt-3 max-w-2xl text-ink-2">{profile.bio[locale]}</p>
          <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="label pt-1 text-ink-3">{t("currentRole")}</dt>
              <dd className="text-ink">
                {profile.currentRole.title[locale]} · {profile.currentRole.org} · {formatYearMonth(profile.currentRole.since, locale)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="sr-only">Location</dt>
              <dd className="text-ink-2">
                {profile.location[locale]} ({profile.timezone})
              </dd>
            </div>
          </dl>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/quick" className="inline-flex min-h-11 items-center rounded-lg bg-cyan px-5 font-semibold text-void transition hover:bg-cyan/85">
              {t("ctaQuick")}
            </Link>
            <Link href="/labs" className="inline-flex min-h-11 items-center rounded-lg border border-violet/60 px-5 font-semibold text-ink transition hover:border-violet hover:bg-violet/10">
              {t("ctaLabs")}
            </Link>
            <a
              href={cvPdfPath(roof.cv.fileName, locale)}
              className="inline-flex min-h-11 items-center rounded-lg border border-glass-border px-5 font-semibold text-ink-2 transition hover:text-ink"
            >
              {tc("downloadCv")}
            </a>
          </div>
        </div>
        <nav aria-labelledby="directory-title" className="glass w-full p-5 lg:w-72">
          <h2 id="directory-title" className="label text-ink-2">
            {t("directoryTitle")}
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-ink-3">{t("directoryIntro")}</p>
          <ul className="mt-4 space-y-1">
            {DIRECTORY.map(({ floor, href }) => (
              <li key={floor}>
                <Link href={href} className="flex min-h-11 items-center gap-3 rounded-md px-2 transition hover:bg-white/5">
                  <span className={`label w-6 ${ACCENT_TEXT[FLOOR_ACCENT[floor]]}`}>{floor}</span>
                  <span className="text-sm text-ink">{tf(floor)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      <Section id="stats" eyebrow="L1" title={t("statsTitle")}>
        <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
          {getStats().map((stat) => (
            <li key={stat.id}>
              <MetricTile value={stat.value} label={stat.label} confidence={stat.confidence} locale={locale} />
            </li>
          ))}
        </ul>
      </Section>

      <Section id="wings" eyebrow="L3" title={t("wingsTitle")} intro={t("wingsIntro")}>
        <div className="grid gap-8 lg:grid-cols-2">
          {wings.map(({ wing, pods }) => (
            <div key={wing}>
              <h3 className={`label mb-3 ${ACCENT_TEXT[WING_ACCENT[wing]]}`}>{tc(`wing.${wing}`)}</h3>
              <ul className="grid gap-3">
                {pods.map((pod) => (
                  <li key={pod.id}>
                    <PodCard pod={pod} locale={locale} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section id="journey" eyebrow="L2" title={t("journeyTitle")}>
        <ul className="grid gap-3 md:grid-cols-2">
          {latest.map((entry) => (
            <li key={entry.id}>
              <TimelineItem entry={entry} locale={locale} />
            </li>
          ))}
        </ul>
        <p className="mt-4">
          <Link href="/journey" className="link">
            {tc("viewAll")}
          </Link>
        </p>
      </Section>

      <Section id="story" title={t("storyTitle")}>
        <p className="max-w-3xl text-base leading-7 text-ink-2">{profile.story[locale]}</p>
      </Section>

      <Section id="how" title={t("howTitle")} intro={profile.howIWork[locale]}>
        <PrincipleGrid principles={profile.principles} locale={locale} />
      </Section>

      <Section id="skills" eyebrow="L1" title={t("skillsTitle")}>
        <SkillsWall skills={getSkills()} locale={locale} />
      </Section>

      <Section id="certifications" eyebrow="L1" title={t("certsTitle")}>
        <CertificationList certifications={getCertifications()} locale={locale} />
      </Section>
    </Container>
  );
}
