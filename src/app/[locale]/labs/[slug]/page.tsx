import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClientMessages } from "@/components/ClientMessages";
import { experienceDataVersion } from "@/experience/gate-data";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { ChipList } from "@/components/Chip";
import { Gallery } from "@/components/Gallery";
import { JsonLd } from "@/components/JsonLd";
import { LiveSiteLink } from "@/components/LiveSiteLink";
import { MetricStrip } from "@/components/MetricStrip";
import { ShareLinks } from "@/components/ShareLinks";
import { Chapter, FactRow, MetricLedger, StepList } from "@/components/page/Case";
import { AskAboutButton } from "@/components/page/AskAboutButton";
import { CaseToc } from "@/components/page/CaseToc";
import { ClosingCta } from "@/components/page/ClosingCta";
import { PodCodeResearch } from "@/components/page/PodCodeResearch";
import { DecisionList, EngineeringList, Lesson } from "@/components/page/Story";
import { CrumbLink } from "@/components/page/Layout";
import { getContent, getLibrary, getPod, getPods, getTimelineEntryById } from "@/content/load";
import { toGalleryImages } from "@/content/media";
import { LOCALES } from "@/content/schema";
import { caseChapters, hasResultsChapter, type ChapterId } from "@/content/case";
import { adjacent, clientLabel, headlineResults, podLiveLink } from "@/content/selectors";
import { assertLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { formatPeriod } from "@/lib/format";
import { pageJsonLd } from "@/lib/jsonld";
import { seoMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => getContent().floors.labs.pods.map((pod) => ({ locale, slug: pod.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/labs/[slug]">): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  return getPod(slug) ? seoMetadata(assertLocale(raw), `/labs/${slug}`) : {};
}

export default async function PodPage({ params }: PageProps<"/[locale]/labs/[slug]">) {
  const { locale: raw, slug } = await params;
  const locale = assertLocale(raw);
  setRequestLocale(locale);
  const pod = getPod(slug);
  if (!pod) notFound();

  const t = await getTranslations({ locale, namespace: "labs" });
  const tw = await getTranslations({ locale, namespace: "work" });
  const tcase = await getTranslations({ locale, namespace: "case" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const tg = await getTranslations({ locale, namespace: "gallery" });
  const siblings = getPods(pod.wing);
  const { prev, next } = adjacent(siblings, siblings.findIndex((p) => p.id === pod.id));
  const entry = pod.timelineRef ? getTimelineEntryById(pod.timelineRef) : undefined;
  const images = toGalleryImages(pod.assets, locale);
  const live = podLiveLink(pod);
  const headline = headlineResults(pod.results);
  const deltaLabels = { from: tc("delta.from"), to: tc("delta.to") };
  const ledgerLabels = { delta: deltaLabels, scale: t("scaleLine") };
  const detail = hasResultsChapter(pod);
  const story = pod.story;
  const engineering = pod.engineering;
  const postTitles = engineering ? Object.fromEntries(getLibrary().posts.map((p) => [p.slug, p.title])) : {};
  const chapterLabel: Record<ChapterId, string> = {
    problem: story ? t("situation") : t("problem"),
    approach: story ? t("decisions") : t("approach"),
    results: t("results"),
    lesson: t("lesson"),
    architecture: t("architecture"),
    engineering: t("engineering.title"),
    gallery: tg("title"),
    code: t("codeResearch"),
    stack: tc("stack"),
  };
  // One chapter list for the TOC and the body (`caseChapters`); key projects always have the 8 standard chapters.
  const toc = caseChapters(pod).map((id) => ({ id, label: chapterLabel[id] }));
  const codeResearch = toc.some((c) => c.id === "code");

  return (
    <ClientMessages>
      <ExperienceGate locale={locale} version={await experienceDataVersion(locale)} startFloor="L3" startRoom={`L3:${pod.slug}`} />
      <JsonLd data={pageJsonLd(locale, `/labs/${pod.slug}`)} />
      <article>
        <header className="pv-wrap pt-6 sm:pt-10 lg:pt-14">
          {/* A breadcrumb in place of the old eyebrow (Hallmark Floor 54): Work, then the wing. */}
          <nav aria-label={tcase("breadcrumb")}>
            <ol className="flex flex-wrap items-center gap-x-3 text-sm text-ink-2">
              <li>
                <CrumbLink crumb={{ href: "/labs", label: tw("title") }} />
              </li>
              <li aria-hidden="true" className="text-ink-3">
                /
              </li>
              <li>{tw(`wingShort.${pod.wing}`)}</li>
            </ol>
          </nav>
          <div className="mt-6 lg:w-3/4">
            <h1 className="pv-d-l text-[length:var(--text-display-s)]">{pod.title[locale]}</h1>
            <p className="pv-lead mt-6">{pod.tagline[locale]}</p>
            {/* Without a results chapter the strip keeps the `#results` anchor (3D drawer tabs link to it). */}
            <section id={detail || story ? undefined : "results"} aria-labelledby="key-results-title" className="mt-8">
              <h2 id="key-results-title" className="sr-only">
                {t("keyResults")}
              </h2>
              <MetricStrip items={headline.map((r) => ({ value: r.value, label: r.label[locale], delta: r.delta }))} label={t("keyResults")} deltaLabels={deltaLabels} />
            </section>
            {live && (
              <p className="mt-8">
                <LiveSiteLink href={live.href} label={tc("visitLive")} srHint={tc("external")} className="pv-btn pv-btn-primary" />
              </p>
            )}
            <div className="mt-6">
              <ShareLinks variant="page" labels={{ group: tc("share"), classic: tc("copyClassicLink"), threeD: tc("copy3dLink"), copied: tc("linkCopied"), failed: tc("linkCopyFailed") }} />
            </div>
          </div>
          <FactRow
            items={[
              { label: t("role"), value: pod.role[locale] },
              { label: t("period"), value: formatPeriod(pod.period.start, pod.period.end, locale) },
              { label: t("client"), value: clientLabel(pod.client, locale) },
              { label: tcase("kind"), value: tc(`tier.${pod.tier}`) },
              { label: tcase("room"), value: `L3:${pod.slug}` },
            ]}
          />
        </header>

        <div className="pv-wrap grid gap-6 lg:grid-cols-12">
          <aside className="pv-case-toc">
            <CaseToc
              key={`${locale}:${pod.slug}`}
              items={toc}
              label={tcase("onThisPage")}
              countLabel={tcase("chapterCount", { count: toc.length })}
            />
          </aside>
          <div className="pv-col pv-case-body min-w-0 lg:col-span-8">
            {story ? (
              <>
                <Chapter id="problem" title={t("situation")}>
                  <p className="pv-lead text-ink-2">{story.situation[locale]}</p>
                </Chapter>
                <Chapter id="approach" title={t("decisions")}>
                  <DecisionList decisions={story.decisions} locale={locale} whyLabel={t("why")} />
                </Chapter>
                <Chapter id="results" title={t("results")}>
                  <MetricLedger results={pod.results} locale={locale} labels={ledgerLabels} />
                </Chapter>
                {story.lesson && (
                  <Chapter id="lesson" title={t("lesson")}>
                    <Lesson text={story.lesson[locale]} />
                  </Chapter>
                )}
              </>
            ) : (
              <>
                {detail && (
                  <Chapter id="results" title={t("results")}>
                    <MetricLedger results={pod.results} locale={locale} labels={ledgerLabels} />
                  </Chapter>
                )}
                <Chapter id="problem" title={t("problem")}>
                  <p className="pv-lead text-ink-2">{pod.problem[locale]}</p>
                </Chapter>
                <Chapter id="approach" title={t("approach")}>
                  <StepList steps={pod.approach} locale={locale} />
                </Chapter>
              </>
            )}
            {pod.architecture && (
              <Chapter id="architecture" title={t("architecture")}>
                <ArchitectureDiagram architecture={pod.architecture} locale={locale} />
              </Chapter>
            )}
            {engineering && (
              <Chapter id="engineering" title={t("engineering.title")}>
                <EngineeringList topics={engineering} locale={locale} labels={{ limits: t("engineering.limits"), post: t("engineering.post") }} posts={postTitles} />
              </Chapter>
            )}
            {images.length > 0 && (
              <Chapter id="gallery" title={tg("title")}>
                <Gallery images={images} layout="mosaic" label={`${tg("title")}: ${pod.title[locale]}`} />
              </Chapter>
            )}
            {codeResearch && (
              <Chapter id="code" title={t("codeResearch")}>
                <PodCodeResearch pod={pod} locale={locale} />
              </Chapter>
            )}
            <Chapter id="stack" title={tc("stack")}>
              <ChipList items={pod.stack} label={tc("stack")} logos />
            </Chapter>
          </div>
        </div>

        <section aria-labelledby="related-title" className="pv-wrap pv-sec-l">
          <h2 id="related-title" className="pv-h2 mb-10">
            {tcase("more", { wing: tc(`wing.${pod.wing}`) })}
          </h2>
          <nav aria-labelledby="related-title" className="grid gap-4 md:grid-cols-2 md:gap-6">
            {prev ? (
              <Link href={`/labs/${prev.slug}`} className="card block p-6 transition-colors hover:border-line-2 hover:bg-surface-2 sm:p-8">
                <span className="pv-meta">{tc("previous")}</span>
                <span className="pv-h3 mt-2 block">{prev.title[locale]}</span>
              </Link>
            ) : (
              <span className="hidden md:block" />
            )}
            {next && (
              <Link href={`/labs/${next.slug}`} className="card block p-6 transition-colors hover:border-line-2 hover:bg-surface-2 sm:p-8 md:text-right">
                <span className="pv-meta">{tc("next")}</span>
                <span className="pv-h3 mt-2 block">{next.title[locale]}</span>
              </Link>
            )}
          </nav>
          {entry && (
            <p className="mt-4 md:mt-6">
              <Link href={`/journey/${entry.slug}`} className="card flex flex-wrap items-baseline gap-x-4 gap-y-1 p-6 transition-colors hover:border-line-2 hover:bg-surface-2 sm:p-8">
                <span className="pv-meta">{t("timeline")}</span>
                <span className="font-semibold text-ink">
                  {entry.role[locale]}, {entry.org}
                </span>
              </Link>
            </p>
          )}
        </section>
      </article>
      <ClosingCta locale={locale}>
        <AskAboutButton question={tcase("askAbout", { title: pod.title[locale] })} label={tcase("askAboutLabel")} />
      </ClosingCta>
    </ClientMessages>
  );
}
