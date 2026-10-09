import type { Asset, Locale } from "./schema";

/** Serializable, localized image for Gallery and Lightbox (safe to pass to client components). */
export interface GalleryImage {
  src: string;
  thumb: string;
  alt: string;
  width: number;
  height: number;
}

/** Every gallery image under public/media ships with a 480 px "<name>.thumb.webp" sibling. */
export function thumbSrc(src: string): string {
  return src.replace(/\.(webp|png|jpe?g)$/i, ".thumb.webp");
}

export function toGalleryImages(assets: readonly Asset[], locale: Locale): GalleryImage[] {
  return assets.map((a) => ({ src: a.src, thumb: thumbSrc(a.src), alt: a.alt[locale], width: a.width, height: a.height }));
}

/** The first asset of a pod is its cover (pod cards, quick view, drawer header). */
export function coverImage(assets: readonly Asset[], locale: Locale): GalleryImage | undefined {
  return assets[0] ? toGalleryImages([assets[0]], locale)[0] : undefined;
}
