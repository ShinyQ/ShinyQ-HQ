import { getTranslations } from "next-intl/server";
import type { Locale, Pod } from "@/content/schema";
import { Link } from "@/i18n/navigation";
import { coverImage } from "@/content/media";
import { ACCENT_BORDER, ACCENT_DOT, ACCENT_GLOW, ACCENT_TEXT } from "@/lib/accent";
import { formatPeriod } from "@/lib/format";
import { TechLogoRow } from "./Chip";

export async function PodCard({ pod, locale, compact = false }: { pod: Pod; locale: Locale; compact?: boolean }) {
  const t = await getTranslations({ locale, namespace: "common" });
  const headline = pod.results[0];
  const cover = compact ? undefined : coverImage(pod.assets, locale);
  return (
    <article
      className={`glass group relative flex h-full flex-col gap-3 border p-5 transition duration-150 ${ACCENT_BORDER[pod.accent]} ${ACCENT_GLOW[pod.accent]}`}
    >
      {cover && (
        <div className="-mx-5 -mt-5 mb-1 overflow-hidden rounded-t-[inherit] border-b border-glass-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover.thumb}
            alt={cover.alt}
            width={480}
            height={300}
            loading="lazy"
            decoding="async"
            className="aspect-[16/10] w-full object-cover object-top transition duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${ACCENT_DOT[pod.accent]}`} aria-hidden="true" />
        <p className={`label ${ACCENT_TEXT[pod.accent]}`}>
          L3 · {t(`wing.${pod.wing}`)} · {t(`tier.${pod.tier}`)}
        </p>
      </div>
      <h3 className="text-lg leading-6 font-bold text-ink">
        <Link href={`/labs/${pod.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
          {pod.title[locale]}
        </Link>
      </h3>
      <p className="text-sm leading-6 text-ink-2">{pod.tagline[locale]}</p>
      <TechLogoRow items={pod.stack} max={compact ? 4 : 6} />
      {!compact && headline && (
        <p className="mt-auto border-t border-glass-border pt-3 text-sm leading-5">
          <span className="font-bold text-ink">{headline.value}</span>{" "}
          <span className="text-ink-2">{headline.label[locale]}</span>
        </p>
      )}
      <p className="label text-ink-3">
        {pod.client ? `${pod.client} · ` : ""}
        {formatPeriod(pod.period.start, pod.period.end, locale)}
      </p>
    </article>
  );
}
