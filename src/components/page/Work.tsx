import { getTranslations } from "next-intl/server";
import type { Locale, Pod } from "@/content/schema";
import { coverImage } from "@/content/media";
import { podAttrs } from "@/content/pageview";
import { clientLabel, podLiveLink } from "@/content/selectors";
import { Link } from "@/i18n/navigation";
import { formatYearMonth } from "@/lib/format";
import { TechLogoRow } from "../Chip";
import { LiveSiteLink } from "../LiveSiteLink";
import { ProjectPlaceholder } from "./ProjectPlaceholder";

/**
 * "Visit live site" on a project card or row (R4-J). `relative z-10` lifts it over the card's
 * stretched title link (`pv-stretch`), so both stay clickable. Renders nothing without a live site.
 */
export async function PodLiveCta({ pod, locale, className = "" }: { pod: Pod; locale: Locale; className?: string }) {
  const live = podLiveLink(pod);
  if (!live) return null;
  const tc = await getTranslations({ locale, namespace: "common" });
  return (
    <LiveSiteLink
      href={live.href}
      label={tc("visitLive")}
      srHint={tc("external")}
      className={`pv-uline relative z-10 inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-ink hover:text-cyan ${className}`}
    />
  );
}

/**
 * One project in the index: its cover thumbnail when it has screenshots (owner request 2026-10-15; a designed
 * placeholder keeps the column aligned otherwise), title and stack, client, start date and the headline result.
 * The thumbnail is the 480 px file, lazy, below the stretched title link, so a click opens the case study.
 */
export async function WorkRow({ pod, locale }: { pod: Pod; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "work" });
  const result = pod.results[0];
  const start = formatYearMonth(pod.period.start, locale);
  const cover = coverImage(pod.assets, locale);
  return (
    <li
      {...podAttrs(pod)}
      className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 gap-y-3 py-5 sm:grid-cols-[136px_minmax(0,1fr)] sm:gap-x-6 md:grid-cols-[136px_minmax(0,5fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,3fr)] md:py-6"
    >
      <div className="row-span-2 self-start md:row-span-1 md:pt-1" data-row-thumb={cover ? "" : undefined} data-row-placeholder={cover ? undefined : ""}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.thumb}
            alt=""
            width={480}
            height={300}
            loading="lazy"
            decoding="async"
            className="aspect-[16/10] w-full rounded-lg border border-line object-cover object-top"
          />
        ) : (
          <ProjectPlaceholder id={`ph-row-${pod.slug}`} title={pod.title[locale]} wing={pod.wing} size="row" />
        )}
      </div>
      <div className="min-w-0">
        <h3 className="pv-h3 pv-row-title">
          <Link href={`/labs/${pod.slug}`} className="pv-stretch">
            {pod.title[locale]}
          </Link>
        </h3>
        <p className="pv-meta mt-1">
          {t(`wingShort.${pod.wing}`)}
          <span className="md:hidden">{[clientLabel(pod.client, locale), start].filter(Boolean).map((v) => `, ${v}`)}</span>
        </p>
        <p className="pv-small mt-2 max-w-[60ch]">{pod.tagline[locale]}</p>
        <div className="mt-3">
          <TechLogoRow items={pod.stack} max={8} />
        </div>
        <PodLiveCta pod={pod} locale={locale} className="mt-2" />
      </div>
      <p className="pv-small hidden md:block md:pt-6">{clientLabel(pod.client, locale)}</p>
      <p className="pv-date hidden md:block md:pt-7">{start}</p>
      {result && (
        <div className="col-start-2 md:col-start-auto md:pt-6">
          <p className="pv-num text-[22px]">{result.value}</p>
          <p className="pv-result-label">{result.label[locale]}</p>
        </div>
      )}
    </li>
  );
}
