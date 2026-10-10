import { getTranslations } from "next-intl/server";
import type { Locale, Pod } from "@/content/schema";
import { coverImage } from "@/content/media";
import { podAttrs } from "@/content/pageview";
import { Link } from "@/i18n/navigation";
import { WING_ACCENT } from "@/lib/accent";
import { formatPeriod, formatYearMonth } from "@/lib/format";
import { TechLogoRow } from "../Chip";
import { Marker } from "./Layout";

/**
 * A project with its cover (or its headline result when it has no images).
 * `lead`: full image and two outcomes; `pair`: wide thumb and one outcome; `grid`: thumb and stack logos.
 */
export async function WorkFeature({ pod, locale, size }: { pod: Pod; locale: Locale; size: "lead" | "pair" | "grid" }) {
  const t = await getTranslations({ locale, namespace: "work" });
  const cover = coverImage(pod.assets, locale);
  const [first, second] = pod.results;
  return (
    <article className="pv-feature relative flex h-full flex-col gap-4">
      {cover ? (
        <div className="pv-shot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={size === "lead" ? cover.src : cover.thumb}
            alt={cover.alt}
            width={size === "lead" ? cover.width : 480}
            height={size === "lead" ? cover.height : 300}
            loading={size === "lead" ? "eager" : "lazy"}
            decoding="async"
            className={size === "pair" ? "aspect-[16/8]" : "aspect-[16/10]"}
          />
        </div>
      ) : (
        first && (
          <div className="card flex min-h-[200px] flex-col justify-end p-6 sm:p-8">
            <p className="pv-num text-[44px] sm:text-[56px]">{first.value}</p>
            <p className="pv-small mt-3 max-w-[40ch]">{first.label[locale]}</p>
          </div>
        )
      )}
      <p className="pv-data flex flex-wrap items-center gap-x-4 gap-y-1">
        <Marker accent={WING_ACCENT[pod.wing]}>{t(`wingShort.${pod.wing}`)}</Marker>
        <span>{formatPeriod(pod.period.start, pod.period.end, locale)}</span>
        {pod.client && <span>{pod.client}</span>}
      </p>
      <h3 className={`pv-h3 pv-feature-title ${size === "pair" ? "" : "pv-h3-l"}`}>
        <Link href={`/labs/${pod.slug}`} className="pv-stretch">
          {pod.title[locale]}
        </Link>
      </h3>
      <p className="pv-body">{pod.tagline[locale]}</p>
      {size === "lead" && first && (
        <dl className="grid gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-2">
          {[first, second].filter(Boolean).map((r) => (
            <div key={r!.value}>
              <dt className="pv-num text-[28px]">{r!.value}</dt>
              <dd className="mt-1 text-sm leading-5 text-ink-2">{r!.label[locale]}</dd>
            </div>
          ))}
        </dl>
      )}
      {size === "pair" && first && (
        <p className="pv-small">
          <span className="pv-num text-[20px]">{first.value}</span> {first.label[locale]}
        </p>
      )}
      {size === "grid" && cover && <TechLogoRow items={pod.stack} max={9} />}
    </article>
  );
}

/** One project in the index: title and stack, client, start date and the headline result. */
export async function WorkRow({ pod, locale }: { pod: Pod; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "work" });
  const result = pod.results[0];
  const start = formatYearMonth(pod.period.start, locale);
  return (
    <li
      {...podAttrs(pod)}
      className="grid gap-x-6 gap-y-3 py-5 md:grid-cols-[minmax(0,5fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,3fr)] md:py-6"
    >
      <div className="min-w-0">
        <p className="pv-data mb-2 flex flex-wrap gap-x-4">
          <Marker accent={WING_ACCENT[pod.wing]}>{t(`wingShort.${pod.wing}`)}</Marker>
          <span className="md:hidden">{[pod.client, start].filter(Boolean).join(" · ")}</span>
        </p>
        <h3 className="pv-h3 pv-row-title text-[20px]">
          <Link href={`/labs/${pod.slug}`} className="pv-stretch">
            {pod.title[locale]}
          </Link>
        </h3>
        <p className="pv-small mt-1.5 max-w-[60ch]">{pod.tagline[locale]}</p>
        <div className="mt-3">
          <TechLogoRow items={pod.stack} max={8} />
        </div>
      </div>
      <p className="pv-small hidden md:block md:pt-6">{pod.client}</p>
      <p className="pv-data hidden md:block md:pt-7">{start}</p>
      {result && (
        <div className="md:pt-6">
          <p className="pv-num text-[22px]">{result.value}</p>
          <p className="mt-1 text-[13px] leading-[19px] text-ink-2">{result.label[locale]}</p>
        </div>
      )}
    </li>
  );
}
