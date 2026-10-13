import { getTranslations } from "next-intl/server";
import type { Locale, Pod } from "@/content/schema";
import { toGalleryImages } from "@/content/media";
import { clientLabel } from "@/content/selectors";
import { Link } from "@/i18n/navigation";
import { WING_ACCENT } from "@/lib/accent";
import { formatPeriod } from "@/lib/format";
import { Marker } from "./Layout";
import { PodLiveCta } from "./Work";

/** Thumbnails in the filmstrip under a featured project's cover (always this many slots, so cards line up). */
const FILM = 3;

/**
 * A landing feature card: the pod's cover with its screenshot count, a filmstrip of the next gallery images,
 * then wing, period, client, the title (the card's link), tagline, and at the bottom the live-site link and
 * the headline result. Cards share one grid with equal heights (owner request, round 5). Only pods with a
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
          srcSet={`${cover.thumb} 480w, ${cover.src} ${cover.width}w`}
          sizes="(min-width: 1024px) 480px, (min-width: 768px) 50vw, 100vw"
          alt={cover.alt}
          width={cover.width}
          height={cover.height}
          loading="lazy"
          decoding="async"
          className="aspect-[16/10]"
        />
        <span className="pv-data hx-shots">{th("featuredShots", { count: pod.assets.length })}</span>
      </div>
      <ul className="hx-film" aria-hidden="true">
        {film.map((image, i) => (
          <li key={image?.src ?? `empty-${i}`}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.thumb} alt="" width={480} height={300} loading="lazy" decoding="async" />
            ) : (
              <span className="hx-film-empty" />
            )}
          </li>
        ))}
      </ul>
      <p className="pv-data flex flex-wrap items-center gap-x-4 gap-y-1">
        <Marker accent={WING_ACCENT[pod.wing]}>{t(`wingShort.${pod.wing}`)}</Marker>
        <span>{formatPeriod(pod.period.start, pod.period.end, locale)}</span>
        {pod.client && <span>{clientLabel(pod.client, locale)}</span>}
      </p>
      <h3 className="pv-h3 pv-feature-title">
        <Link href={`/labs/${pod.slug}`} className="pv-stretch">
          {pod.title[locale]}
        </Link>
      </h3>
      <p className="pv-body">{pod.tagline[locale]}</p>
      <div className="mt-auto flex flex-col gap-4">
        <PodLiveCta pod={pod} locale={locale} />
        {result && (
          <p className="pv-small">
            <span className="pv-num text-[22px]">{result.value}</span> {result.label[locale]}
          </p>
        )}
      </div>
    </article>
  );
}
