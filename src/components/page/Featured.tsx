import { getTranslations } from "next-intl/server";
import type { Locale, Pod } from "@/content/schema";
import { imageSrcSet, toGalleryImages } from "@/content/media";
import { clientLabel } from "@/content/selectors";
import { Link } from "@/i18n/navigation";
import { formatPeriod } from "@/lib/format";
import { TechLogoRow } from "../Chip";
import { ProjectPlaceholder } from "./ProjectPlaceholder";
import { PodLiveCta } from "./Work";

/** Thumbnails in the filmstrip under a featured project's cover (always this many slots, so rows line up). */
const FILM = 3;

/**
 * `sizes` of a Feature Stack cover: half of the 1312 px measure from 1024 px (640 px, so a 1440 px screenshot stays
 * sharp at 2x), else the full width.
 */
export const FEATURE_SIZES = "(min-width: 1024px) 640px, 100vw";

/**
 * One row of the Feature Stack (Hallmark redesign 2026-10-27, replacing the 3/2/1 card grid): the text held beside the
 * screenshots on six columns (sticky from 1024 px), the cover and its filmstrip on the other six. The text leads with the
 * title (the row's link), then the headline result in the display face (recruiters scan results first), the tagline,
 * the facts, on /labs the stack logos (`stack`), and the live-site link. Only pods with a gallery are featured (`pickFeaturedPods`). Images load lazily:
 * the section starts below the first screen, so they never compete with the hero for LCP.
 */
export async function FeaturedProject({ pod, locale, stack = false }: { pod: Pod; locale: Locale; stack?: boolean }) {
  const t = await getTranslations({ locale, namespace: "work" });
  const tl = await getTranslations({ locale, namespace: "labs" });
  const th = await getTranslations({ locale, namespace: "home" });
  const [cover, ...rest] = toGalleryImages(pod.assets, locale);
  if (!cover) return null;
  const result = pod.results[0];
  const film = Array.from({ length: FILM }, (_, i) => rest[i]);
  const client = clientLabel(pod.client, locale);
  return (
    <article className="pv-feature hx-feature" data-feature-pod={pod.slug}>
      <div className="hx-feature-text">
        <h3 className="pv-h3 pv-h3-l pv-feature-title">
          <Link href={`/labs/${pod.slug}`} className="pv-stretch">
            {pod.title[locale]}
          </Link>
        </h3>
        {result && (
          <div className="pv-result" data-testid="feature-result">
            <p className="pv-num hx-feature-result">{result.value}</p>
            <p className="pv-result-label">{result.label[locale]}</p>
          </div>
        )}
        <p className="pv-card-text">{pod.tagline[locale]}</p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className="pv-meta">{t("wing")}</dt>
            <dd className="mt-1 text-ink">{t(`wingShort.${pod.wing}`)}</dd>
          </div>
          <div>
            <dt className="pv-meta">{tl("period")}</dt>
            <dd className="mt-1 text-ink">{formatPeriod(pod.period.start, pod.period.end, locale)}</dd>
          </div>
          {client && (
            <div className="col-span-2">
              <dt className="pv-meta">{tl("client")}</dt>
              <dd className="mt-1 text-ink">{client}</dd>
            </div>
          )}
        </dl>
        {stack && <TechLogoRow items={pod.stack} max={9} />}
        <PodLiveCta pod={pod} locale={locale} />
      </div>
      <div className="min-w-0">
        {/* The sticky text column holds the title link's cover, so the screenshot carries its own (hidden) link. */}
        <Link href={`/labs/${pod.slug}`} tabIndex={-1} aria-hidden="true" className="pv-shot block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover.src}
            srcSet={imageSrcSet(cover)}
            sizes={FEATURE_SIZES}
            alt={cover.alt}
            width={cover.width}
            height={cover.height}
            loading="lazy"
            decoding="async"
            className="aspect-[16/10]"
          />
        </Link>
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
        <p className="pv-meta mt-3">{th("featuredShots", { count: pod.assets.length })}</p>
      </div>
    </article>
  );
}
