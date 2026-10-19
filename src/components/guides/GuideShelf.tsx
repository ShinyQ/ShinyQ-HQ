import { getTranslations } from "next-intl/server";
import { AccentDot, type DotTone } from "@/components/AccentDot";
import { SectionSplit } from "@/components/page/Layout";
import { guideViews } from "@/content/guide-views";
import type { GuideView } from "@/content/guides";
import type { Locale } from "@/content/schema";

/** Issuer tones for the dot and the domain bar; any other issuer stays neutral. */
const ISSUER_TONE: Record<string, { dot: DotTone; bar: string }> = {
  Microsoft: { dot: "cyan", bar: "bg-cyan" },
  GitHub: { dot: "violet", bar: "bg-violet" },
  Google: { dot: "amber", bar: "bg-amber" },
};
const NEUTRAL_TONE = { dot: "muted", bar: "bg-ink-3" } as const;

export interface GuideCardLabels {
  /** "{count} pages", already resolved for this guide. */
  pages: string;
  /** "Edition {date}", already resolved for this guide. */
  edition: string;
  domains: string;
  read: string;
  download: string;
}

/** One study guide: cover, issuer and exam code, title, pages, size and edition, summary, exam domain weights, Read and Download. */
export function GuideCard({ view, labels }: { view: GuideView; labels: GuideCardLabels }) {
  const tone = ISSUER_TONE[view.issuer] ?? NEUTRAL_TONE;
  const domainsId = `guide-${view.slug}-domains`;
  return (
    <li className="card flex flex-col p-5 sm:p-6">
      <div className="grid grid-cols-[96px_1fr] gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={view.cover} width={240} height={340} loading="lazy" decoding="async" alt="" className="h-auto w-full rounded-md border border-line" />
        <div className="min-w-0">
          <p className="pv-data flex flex-wrap items-center gap-x-2">
            <AccentDot tone={tone.dot} />
            <span>{view.issuer}</span>
            {view.code && <span>· {view.code}</span>}
          </p>
          <h3 className="pv-h3 mt-3">{view.title}</h3>
          <p className="pv-data mt-3">
            {labels.pages} · {view.sizeLabel} · {labels.edition}
          </p>
        </div>
      </div>
      <p className="pv-small mt-4">{view.summary}</p>
      <div className="mt-4">
        <p id={domainsId} className="label text-ink-3">
          {labels.domains}
        </p>
        <div aria-hidden="true" className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
          {view.domains.map((d) => (
            <span
              key={d.label}
              data-guide-domain=""
              title={`${d.label} ${d.weightLabel}`}
              className={`block h-full ${tone.bar}`}
              style={{ flexGrow: (d.weight[0] + d.weight[1]) / 2 }}
            />
          ))}
        </div>
        <ul aria-labelledby={domainsId} className="sr-only">
          {view.domains.map((d) => (
            <li key={d.label}>{`${d.label} ${d.weightLabel}`}</li>
          ))}
        </ul>
      </div>
      <div className="mt-auto pt-5">
        {/* Server markup: `DialogHost` opens the reader from any `[data-hq-guide]` click, so the shelf ships no island. */}
        <div className="flex flex-wrap gap-3">
          <button type="button" data-hq-guide={view.slug} data-testid="guide-read" aria-haspopup="dialog" className="pv-btn pv-btn-primary">
            {labels.read}
            <span className="sr-only">: {view.title}</span>
          </button>
          <a href={view.downloadUrl} download={view.file} className="pv-btn pv-btn-ghost">
            {labels.download}
            <span className="sr-only">: {view.title}</span>
          </a>
        </div>
      </div>
    </li>
  );
}

/**
 * The Classic "Study guides" shelf on the Writing page (`#guides`): one card per guide, in file order, then a note
 * that the guides are independent material. Server-rendered: its `guides` strings never ship to the client.
 */
export async function GuideShelf({ locale, guides = guideViews(locale) }: { locale: Locale; guides?: GuideView[] }) {
  if (guides.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "library" });
  const tg = await getTranslations({ locale, namespace: "guides" });
  return (
    <SectionSplit id="guides" title={t("guides")} intro={t("guidesIntro")}>
      <ul className="grid gap-4 md:grid-cols-2">
        {guides.map((view) => (
          <GuideCard
            key={view.slug}
            view={view}
            labels={{
              pages: tg("pages", { count: view.pages }),
              edition: tg("edition", { date: view.editionLabel }),
              domains: tg("domains"),
              read: tg("read"),
              download: tg("download"),
            }}
          />
        ))}
      </ul>
      <p className="pv-small mt-4 text-ink-3">{tg("independent")}</p>
    </SectionSplit>
  );
}
