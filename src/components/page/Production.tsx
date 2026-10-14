import { getTranslations } from "next-intl/server";
import { AlertExcerpt } from "@/components/AlertExcerpt";
import { getPod, getProduction } from "@/content/load";
import { imageSrcSet, toGalleryImages } from "@/content/media";
import type { Locale } from "@/content/schema";
import { Link } from "@/i18n/navigation";
import { SectionSplit } from "./Layout";

/**
 * About `#production` (owner approved 2026-10-14): "How I run AI in production". The approved text, the
 * proof tiles, the masked dashboard and alert rule, then the case studies that prove it. Server only.
 */
export async function ProductionSection({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "production" });
  const p = getProduction();
  const cases = p.caseStudies.flatMap((slug) => {
    const pod = getPod(slug);
    return pod ? [pod] : [];
  });
  const dashboard = p.dashboard ? { ...toGalleryImages([p.dashboard], locale)[0], caption: p.dashboard.caption[locale] } : null;

  return (
    <SectionSplit id="production" title={p.title[locale]} intro={p.intro[locale]}>
      <ul className="pv-rows pv-rows-closed" data-testid="production-points">
        {p.points.map((point) => (
          <li key={point.id} className="py-4 sm:py-5">
            <p className="max-w-[68ch] text-ink-2">
              <strong className="font-semibold text-ink">{point.lead[locale]}</strong> {point.text[locale]}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-6 max-w-[68ch] text-ink-2">{p.outro[locale]}</p>

      <h3 className="pv-data mt-10 mb-4">{t("proof")}</h3>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="production-tiles">
        {p.tiles.map((tile) => (
          <li key={tile.id} className="card p-4 sm:p-5">
            <p className="pv-data">{tile.label[locale]}</p>
            <p className="pv-num mt-2 text-[32px] leading-none sm:text-[38px]">{tile.value[locale]}</p>
            <p className="pv-small mt-2 text-ink-2">{tile.detail[locale]}</p>
          </li>
        ))}
      </ul>

      {dashboard && (
        <figure className="mt-10" data-testid="production-dashboard">
          <img
            src={dashboard.src}
            srcSet={imageSrcSet(dashboard)}
            sizes="(min-width: 1024px) 760px, 100vw"
            width={dashboard.width}
            height={dashboard.height}
            alt={dashboard.alt}
            loading="lazy"
            decoding="async"
            className="h-auto w-full rounded-lg border border-line"
          />
          <figcaption className="pv-small mt-3 text-ink-2">{dashboard.caption}</figcaption>
        </figure>
      )}

      {p.alertExcerpt && <AlertExcerpt className="mt-10" label={t("excerpt")} caption={p.alertExcerpt.caption[locale]} code={p.alertExcerpt.code} />}

      <h3 className="pv-data mt-10 mb-2">{t("cases")}</h3>
      <ul className="pv-rows pv-rows-closed" data-testid="production-cases">
        {cases.map((pod) => (
          <li key={pod.slug}>
            <Link href={`/labs/${pod.slug}`} className="flex min-h-14 flex-col justify-center gap-0.5 py-3">
              <span className="pv-row-title text-ink">{pod.title[locale]}</span>
              <span className="pv-small text-ink-2">{pod.tagline[locale]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionSplit>
  );
}
