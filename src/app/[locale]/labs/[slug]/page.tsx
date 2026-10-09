import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { experienceDataFor } from "@/experience/gate-data";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { ChipList } from "@/components/Chip";
import { Gallery } from "@/components/Gallery";
import { JsonLd } from "@/components/JsonLd";
import { MetricTile } from "@/components/MetricTile";
import { Container, Section } from "@/components/Section";
import { getContent, getPod, getPods, getTimelineEntryById } from "@/content/load";
import { toGalleryImages } from "@/content/media";
import { LOCALES } from "@/content/schema";
import { adjacent } from "@/content/selectors";
import { assertLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { ACCENT_DOT, ACCENT_TEXT } from "@/lib/accent";
import { formatPeriod } from "@/lib/format";
import { podJsonLd } from "@/lib/jsonld";
import { ogImagePath, pageMetadata } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => getContent().floors.labs.pods.map((pod) => ({ locale, slug: pod.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/labs/[slug]">): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = assertLocale(raw);
  const pod = getPod(slug);
  if (!pod) return {};
  return pageMetadata({
    locale,
    path: `/labs/${slug}`,
    title: pod.title[locale],
    description: pod.tagline[locale],
    type: "article",
    tags: pod.stack,
    image: ogImagePath({ kind: "labs", locale, slug }),
  });
}

export default async function PodPage({ params }: PageProps<"/[locale]/labs/[slug]">) {
  const { locale: raw, slug } = await params;
  const locale = assertLocale(raw);
  setRequestLocale(locale);
  const pod = getPod(slug);
  if (!pod) notFound();

  const t = await getTranslations({ locale, namespace: "labs" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const tg = await getTranslations({ locale, namespace: "gallery" });
  const siblings = getPods(pod.wing);
  const { prev, next } = adjacent(siblings, siblings.findIndex((p) => p.id === pod.id));
  const entry = pod.timelineRef ? getTimelineEntryById(pod.timelineRef) : undefined;

  return (
    <Container>
      <ExperienceGate data={await experienceDataFor(locale)} startFloor="L3" startRoom={`L3:${pod.slug}`} />
      <JsonLd data={podJsonLd(pod, locale)} />
      <article>
        <header className="pt-10 pb-2 sm:pt-16">
          <p className="mb-4">
            <Link href="/labs" className="link text-sm">
              ← {t("back")}
            </Link>
          </p>
          <p className={`label flex items-center gap-2 ${ACCENT_TEXT[pod.accent]}`}>
            <span className={`h-2 w-2 rounded-full ${ACCENT_DOT[pod.accent]}`} aria-hidden="true" />
            L3:{pod.slug} · {tc(`wing.${pod.wing}`)} · {tc(`tier.${pod.tier}`)}
          </p>
          <h1 className="mt-3 text-[26px] leading-[32px] font-extrabold tracking-tight text-ink sm:text-[32px] sm:leading-[38px]">
            {pod.title[locale]}
          </h1>
          <p className="mt-3 max-w-3xl text-lg text-ink-2">{pod.tagline[locale]}</p>
          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
            {pod.client && (
              <div className="glass px-4 py-3">
                <dt className="label text-ink-3">{t("client")}</dt>
                <dd className="mt-1 text-ink">{pod.client}</dd>
              </div>
            )}
            <div className="glass px-4 py-3">
              <dt className="label text-ink-3">{t("role")}</dt>
              <dd className="mt-1 text-ink">{pod.role[locale]}</dd>
            </div>
            <div className="glass px-4 py-3">
              <dt className="label text-ink-3">{t("period")}</dt>
              <dd className="mt-1 text-ink">{formatPeriod(pod.period.start, pod.period.end, locale)}</dd>
            </div>
          </dl>
        </header>

        <Section id="results" title={t("results")}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {pod.results.map((r, i) => (
              <li key={i}>
                <MetricTile value={r.value} label={r.label} context={r.context} confidence={r.confidence} locale={locale} />
              </li>
            ))}
          </ul>
        </Section>

        {pod.assets.length > 0 && (
          <Section id="gallery" title={tg("title")}>
            <Gallery images={toGalleryImages(pod.assets, locale)} label={`${tg("title")}: ${pod.title[locale]}`} />
          </Section>
        )}

        <Section id="problem" title={t("problem")}>
          <p className="max-w-3xl text-base leading-7 text-ink-2">{pod.problem[locale]}</p>
        </Section>

        <Section id="approach" title={t("approach")}>
          <ul className="max-w-3xl space-y-3">
            {pod.approach.map((step, i) => (
              <li key={i} className="flex gap-3 text-base leading-7 text-ink-2">
                <span className="label pt-1.5 text-cyan" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{step[locale]}</span>
              </li>
            ))}
          </ul>
        </Section>

        {pod.architecture && (
          <Section id="architecture" title={t("architecture")}>
            <ArchitectureDiagram architecture={pod.architecture} locale={locale} />
          </Section>
        )}

        <Section id="stack" title={tc("stack")}>
          <ChipList items={pod.stack} label={tc("stack")} logos />
        </Section>

        {entry && (
          <p className="glass inline-flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
            <span className="label text-amber">L2 · {t("timeline")}</span>
            <Link href={`/journey/${entry.slug}`} className="link">
              {entry.role[locale]} · {entry.org}
            </Link>
          </p>
        )}

        <nav aria-label={tc("next")} className="mt-10 grid gap-3 border-t border-glass-border pt-6 sm:grid-cols-2">
          {prev ? (
            <Link href={`/labs/${prev.slug}`} className="glass block p-4 transition hover:border-cyan/60">
              <span className="label text-ink-3">← {tc("previous")}</span>
              <span className="mt-1 block font-semibold text-ink">{prev.title[locale]}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/labs/${next.slug}`} className="glass block p-4 text-right transition hover:border-cyan/60">
              <span className="label text-ink-3">{tc("next")} →</span>
              <span className="mt-1 block font-semibold text-ink">{next.title[locale]}</span>
            </Link>
          )}
        </nav>
      </article>
    </Container>
  );
}
