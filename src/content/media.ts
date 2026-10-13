import type { Asset, Locale } from "./schema";

/** Width of the "<name>.thumb.webp" sibling every gallery image ships with. */
export const THUMB_WIDTH = 480;
/** Width of the "<name>.w1200.webp" rendition of images wider than this (scripts/media-sizes.ts). */
export const MID_WIDTH = 1200;

/** Serializable, localized image for Gallery and Lightbox (safe to pass to client components). */
export interface GalleryImage {
  src: string;
  thumb: string;
  /** 1200 px rendition, only for images wider than MID_WIDTH. */
  mid?: string;
  alt: string;
  width: number;
  height: number;
}

/** Every gallery image under public/media ships with a 480 px "<name>.thumb.webp" sibling. */
export function thumbSrc(src: string): string {
  return src.replace(/\.(webp|png|jpe?g)$/i, ".thumb.webp");
}

/** The 1200 px "<name>.w1200.webp" rendition of an image wider than MID_WIDTH. */
export function midSrc(src: string): string {
  return src.replace(/\.(webp|png|jpe?g)$/i, ".w1200.webp");
}

/** `srcset` for a project image: thumb, 1200 px (when it exists) and the full file, by width. */
export function imageSrcSet(image: Pick<GalleryImage, "src" | "thumb" | "mid" | "width">): string {
  const parts = [`${image.thumb} ${THUMB_WIDTH}w`];
  if (image.mid) parts.push(`${image.mid} ${MID_WIDTH}w`);
  parts.push(`${image.src} ${image.width}w`);
  return parts.join(", ");
}

/** `sizes` of the project cards: one third of the 1240 px container from 1024 px, half from 768 px, else the full width. */
export const CARD_SIZES = "(min-width: 1024px) 400px, (min-width: 768px) 50vw, 100vw";

export function toGalleryImages(assets: readonly Asset[], locale: Locale): GalleryImage[] {
  return assets.map((a) => ({
    src: a.src,
    thumb: thumbSrc(a.src),
    ...(a.width > MID_WIDTH ? { mid: midSrc(a.src) } : {}),
    alt: a.alt[locale],
    width: a.width,
    height: a.height,
  }));
}

/** The first asset of a pod is its cover (pod cards, quick view, drawer header). */
export function coverImage(assets: readonly Asset[], locale: Locale): GalleryImage | undefined {
  return assets[0] ? toGalleryImages([assets[0]], locale)[0] : undefined;
}
