import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChipList } from "@/components/Chip";
import { ConfidenceBadge } from "@/components/MetricTile";
import { ExternalLink } from "@/components/ExternalLink";
import { Container } from "@/components/Section";
import { getContent, getPod, getTimeline, getTimelineEntry } from "@/content/load";
import { LOCALES } from "@/content/schema";
import { adjacent } from "@/content/selectors";
import { assertLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { formatPeriod } from "@/lib/format";
import { pageMetadata } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => getContent().floors.careerArchive.entries.map((e) => ({ locale, slug: e.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/journey/[slug]">): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = assertLocale(raw);
  const entry = getTimelineEntry(slug);
  if (!entry) return {};
  return pageMetadata({ locale, path: `/journey/${slug}`, title: `${entry.role[locale]} · ${entry.org}`, description: entry.summary[locale] });
}

export default async function JourneyEntryPage({ params }: PageProps<"/[locale]/journey/[slug]">) {
  const { locale: raw, slug } = await params;
  const locale = assertLocale(raw);
  setRequestLocale(locale);
  const entry = getTimelineEntry(slug);
  if (!entry) notFound();

  const t = await getTranslations({ locale, namespace: "journey" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const timeline = getTimeline();
  const { prev, next } = adjacent(timeline, timeline.findIndex((e) => e.id === entry.id));
  const pod = entry.podRef ? getPod(entry.podRef) : undefined;

  return (
    <Container>
      <article className="max-w-3xl pt-10 sm:pt-16">
        <p className="mb-4">
          <Link href="/journey" className="link text-sm">
            ← {t("back")}
          </Link>
        </p>
        <p className="label text-amber">
          L2:{entry.slug} · {tc(`type.${entry.type}`)}
        </p>
        <h1 className="mt-3 text-[26px] leading-[32px] font-extrabold tracking-tight text-ink sm:text-[32px] sm:leading-[38px]">
          {entry.role[locale]}
        </h1>
        <p className="mt-2 text-lg text-ink">
          {entry.url ? <ExternalLink href={entry.url}>{entry.org}</ExternalLink> : entry.org}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-2">
          {formatPeriod(entry.start, entry.end, locale)}
          {entry.confidence && <ConfidenceBadge confidence={entry.confidence} locale={locale} />}
        </p>
        <p className="mt-6 text-base leading-7 text-ink-2">{entry.summary[locale]}</p>

        {entry.highlights.length > 0 && (
          <section aria-labelledby="highlights" className="mt-8">
            <h2 id="highlights" className="label mb-3 text-ink-2">
              {tc("highlights")}
            </h2>
            <ul className="space-y-2">
              {entry.highlights.map((h, i) => (
                <li key={i} className="flex gap-3 leading-7 text-ink-2">
                  <span aria-hidden="true" className="text-amber">
                    ▸
                  </span>
                  <span>{h[locale]}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {entry.stack.length > 0 && (
          <section aria-labelledby="stack" className="mt-8">
            <h2 id="stack" className="label mb-3 text-ink-2">
              {tc("stack")}
            </h2>
            <ChipList items={entry.stack} />
          </section>
        )}

        {pod && (
          <p className="mt-8">
            <Link href={`/labs/${pod.slug}`} className="glass inline-flex min-h-11 flex-wrap items-center gap-2 px-4 py-3 transition hover:border-violet/60">
              <span className="label text-violet">L3 · {t("seeCaseStudy")}</span>
              <span className="font-semibold text-ink">{pod.title[locale]} →</span>
            </Link>
          </p>
        )}

        <nav aria-label={tc("next")} className="mt-12 grid gap-3 border-t border-glass-border pt-6 sm:grid-cols-2">
          {prev ? (
            <Link href={`/journey/${prev.slug}`} className="glass block p-4 transition hover:border-amber/60">
              <span className="label text-ink-3">← {tc("previous")}</span>
              <span className="mt-1 block font-semibold text-ink">{prev.role[locale]}</span>
              <span className="block text-sm text-ink-2">{prev.org}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/journey/${next.slug}`} className="glass block p-4 text-right transition hover:border-amber/60">
              <span className="label text-ink-3">{tc("next")} →</span>
              <span className="mt-1 block font-semibold text-ink">{next.role[locale]}</span>
              <span className="block text-sm text-ink-2">{next.org}</span>
            </Link>
          )}
        </nav>
      </article>
    </Container>
  );
}
