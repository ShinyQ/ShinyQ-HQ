import { getTranslations } from "next-intl/server";
import type { Locale, Pod } from "@/content/schema";
import { CARD_SIZES, imageSrcSet, toGalleryImages } from "@/content/media";
import { clientLabel } from "@/content/selectors";
import { Link } from "@/i18n/navigation";
import { WING_ACCENT } from "@/lib/accent";
import { formatPeriod } from "@/lib/format";
import { Marker } from "./Layout";
import { ProjectPlaceholder } from "./ProjectPlaceholder";
import { PodLiveCta } from "./Work";

/** Thumbnails in the filmstrip under a featured project's cover (always this many slots, so cards line up). */
const FILM = 3;

/**
 * A landing feature card: the pod's cover with its screenshot count, a filmstrip of the next gallery images,
 * then wing, period, client, the title (the card's link), the headline result under the title (recruiters scan
 * results first, 2026-10-25), the tagline, and at the bottom the live-site link. Cards share one grid with equal heights (owner request, round 5). Only pods with a
 * gallery are featured (`pickFeaturedPods`). Images load lazily: the section starts below the first screen,
 * so they never compete with the hero for LCP.
 */
export async function FeaturedProject({ pod, locale }: { pod: Pod; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "work" });
  const th = await getTranslations({ locale, namespace: "home" });
  const [cover, ...rest] = toGalleryImages(pod.assets, locale);
  if (!cover) return null;
  const result = pod.results[0];
  const film = Array.from({ length: FILM }, (_, i) => rest[i]);
  return (
    <article className="pv-feature hx-card relative flex h-full flex-col gap-4" data-feature-pod={pod.slug}>
      <div className="pv-shot hx-shot">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover.src}
          srcSet={imageSrcSet(cover)}
          sizes={CARD_SIZES}
          alt={cover.alt}
          width={cover.width}
          height={cover.height}
          loading="lazy"
          decoding="async"
          className="aspect-[16/10]"
        />
        <span className="hx-shots">{th("featuredShots", { count: pod.assets.length })}</span>
      </div>
      <ul className="hx-film" aria-hidden="true">
        {film.map((image, i) => (
          <li key={image?.src ?? `empty-${i}`}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.thumb} alt="" width={480} height={300} loading="lazy" decoding="async" />
            ) : (
              <ProjectPlaceholder id={`ph-film-${pod.slug}-${i}`} title={pod.title[locale]} wing={pod.wing} size="film" />
            )}
          </li>
        ))}
      </ul>
      <p className="pv-data flex flex-wrap items-center gap-x-4 gap-y-1">
        <Marker accent={WING_ACCENT[pod.wing]}>{t(`wingShort.${pod.wing}`)}</Marker>
        <span className="pv-date">{formatPeriod(pod.period.start, pod.period.end, locale)}</span>
        {pod.client && <span>{clientLabel(pod.client, locale)}</span>}
      </p>
      <h3 className="pv-h3 pv-h3-card pv-feature-title">
        <Link href={`/labs/${pod.slug}`} className="pv-stretch">
          {pod.title[locale]}
        </Link>
      </h3>
      {result && (
        <div className="pv-result" data-testid="feature-result">
          <p className="pv-num text-[24px]">{result.value}</p>
          <p className="pv-result-label">{result.label[locale]}</p>
        </div>
      )}
      <p className="pv-card-text">{pod.tagline[locale]}</p>
      <div className="mt-auto flex flex-col gap-4 empty:hidden">
        <PodLiveCta pod={pod} locale={locale} />
      </div>
    </article>
  );
}
