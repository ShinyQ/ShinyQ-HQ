import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClientMessages } from "@/components/ClientMessages";
import { experienceDataFor } from "@/experience/gate-data";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { ChipList } from "@/components/Chip";
import { Gallery } from "@/components/Gallery";
import { JsonLd } from "@/components/JsonLd";
import { LiveSiteLink } from "@/components/LiveSiteLink";
import { ShareLinks } from "@/components/ShareLinks";
import { Chapter, FactRow, MetricLedger, StepList } from "@/components/page/Case";
import { CaseToc } from "@/components/page/CaseToc";
import { PodCodeResearch } from "@/components/page/PodCodeResearch";
import { CrumbLink, Marker } from "@/components/page/Layout";
import { getContent, getPod, getPods, getTimelineEntryById } from "@/content/load";
import { toGalleryImages } from "@/content/media";
import { LOCALES } from "@/content/schema";
import { adjacent, clientLabel, podLiveLink } from "@/content/selectors";
import { assertLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { WING_ACCENT } from "@/lib/accent";
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
  const codeResearch = Boolean(pod.repos?.length || pod.publications?.length);
  const toc = [
    { id: "results", label: t("results") },
    { id: "problem", label: t("problem") },
    { id: "approach", label: t("approach") },
    ...(pod.architecture ? [{ id: "architecture", label: t("architecture") }] : []),
    ...(images.length > 0 ? [{ id: "gallery", label: tg("title") }] : []),
    ...(codeResearch ? [{ id: "code", label: t("codeResearch") }] : []),
    { id: "stack", label: tc("stack") },
  ];

  return (
    <ClientMessages>
      <ExperienceGate data={await experienceDataFor(locale)} startFloor="L3" startRoom={`L3:${pod.slug}`} />
      <JsonLd data={pageJsonLd(locale, `/labs/${pod.slug}`)} />
      <article>
        <header className="pv-wrap pt-6 sm:pt-10 lg:pt-14">
          <CrumbLink crumb={{ href: "/labs", label: tw("title") }} />
          <div className="mt-5 lg:w-3/4">
            <p className="pv-data flex flex-wrap items-center gap-x-4 gap-y-1">
              <Marker accent={WING_ACCENT[pod.wing]}>{tw(`wingShort.${pod.wing}`)}</Marker>
              <span>{tc(`tier.${pod.tier}`)}</span>
              <span className="hidden sm:inline">L3:{pod.slug}</span>
            </p>
            <h1 className="pv-d-l mt-5">{pod.title[locale]}</h1>
            <p className="pv-lead mt-6">{pod.tagline[locale]}</p>
            {live && (
              <p className="mt-8">
                <LiveSiteLink href={live.href} label={tc("visitLive")} srHint={tc("external")} className="pv-btn pv-btn-primary" />
              </p>
            )}
            <div className="mt-6">
              <ShareLinks variant="page" labels={{ group: tc("share"), classic: tc("copyClassicLink"), threeD: tc("copy3dLink"), copied: tc("linkCopied") }} />
            </div>
          </div>
          <FactRow
            items={[
              { label: t("role"), value: pod.role[locale] },
              { label: t("period"), value: formatPeriod(pod.period.start, pod.period.end, locale) },
              { label: t("client"), value: clientLabel(pod.client, locale) },
            ]}
          />
          <section id="results" aria-labelledby="results-title">
            <h2 id="results-title" className="sr-only">
              {t("results")}
            </h2>
            <MetricLedger results={pod.results} locale={locale} />
          </section>
        </header>

        <div className="pv-wrap grid gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <Chapter id="problem" title={t("problem")}>
              <p className="pv-lead text-ink-2">{pod.problem[locale]}</p>
            </Chapter>
            <Chapter id="approach" title={t("approach")}>
              <StepList steps={pod.approach} locale={locale} />
            </Chapter>
            {pod.architecture && (
              <Chapter id="architecture" title={t("architecture")}>
                <ArchitectureDiagram architecture={pod.architecture} locale={locale} />
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
          <aside className="hidden lg:col-span-3 lg:col-start-10 lg:block">
            <div className="sticky top-24 pt-16 lg:pt-20">
              <CaseToc items={toc} label={tcase("onThisPage")} />
            </div>
          </aside>
        </div>

        <section aria-labelledby="related-title" className="pv-wrap pv-sec">
          <h2 id="related-title" className="pv-h2 mb-8">
            {tcase("more", { wing: tc(`wing.${pod.wing}`) })}
          </h2>
          <nav aria-labelledby="related-title" className="grid gap-4 md:grid-cols-2 md:gap-6">
            {prev ? (
              <Link href={`/labs/${prev.slug}`} className="card block p-5 transition hover:border-line-2 hover:bg-surface-2 sm:p-6">
                <span className="pv-data">← {tc("previous")}</span>
                <span className="pv-h3 mt-2 block">{prev.title[locale]}</span>
              </Link>
            ) : (
              <span className="hidden md:block" />
            )}
            {next && (
              <Link href={`/labs/${next.slug}`} className="card block p-5 transition hover:border-line-2 hover:bg-surface-2 sm:p-6 md:text-right">
                <span className="pv-data">{tc("next")} →</span>
                <span className="pv-h3 mt-2 block">{next.title[locale]}</span>
              </Link>
            )}
          </nav>
          {entry && (
            <p className="mt-4 md:mt-6">
              <Link href={`/journey/${entry.slug}`} className="card flex flex-wrap items-center gap-x-4 gap-y-1 p-5 transition hover:border-line-2 hover:bg-surface-2 sm:p-6">
                <span className="pv-data">
                  <Marker accent="amber">L2 · {t("timeline")}</Marker>
                </span>
                <span className="font-semibold text-ink">
                  {entry.role[locale]} · {entry.org}
                </span>
              </Link>
            </p>
          )}
        </section>
      </article>
    </ClientMessages>
  );
}
