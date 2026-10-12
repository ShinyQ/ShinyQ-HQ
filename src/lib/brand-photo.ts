/**
 * The owner's portrait (owner decision 2026-10-13, C5 revised): square webp renditions in
 * public/brand/, shared with the Page View (P1) and the share images (P9).
 */
export const BRAND_PHOTO_WIDTHS = [160, 320, 640] as const;
export type BrandPhotoWidth = (typeof BRAND_PHOTO_WIDTHS)[number];

export function brandPhotoSrc(width: BrandPhotoWidth): string {
  return `/brand/kurniadi-photo-${width}.webp`;
}

export function brandPhotoSrcSet(): string {
  return BRAND_PHOTO_WIDTHS.map((w) => `${brandPhotoSrc(w)} ${w}w`).join(", ");
}
