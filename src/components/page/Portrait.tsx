import { brandPhotoSrc, brandPhotoSrcSet } from "@/lib/brand-photo";

/**
 * The owner's round portrait with a subtle neon ring (C5 revised 2026-10-13). Lazy even above the fold:
 * under the game-first boot cover the page is `content-visibility: hidden`, which keeps lazy images idle,
 * so the portrait never loads before the first 3D frame (quiet boot); on the Page View it is in the
 * viewport and loads at once, at low priority, and never outranks the hero name for LCP.
 */
export function Portrait({ name, size, sizes, className = "" }: { name: string; size: number; sizes: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brandPhotoSrc(320)}
      srcSet={brandPhotoSrcSet()}
      sizes={sizes}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      fetchPriority="low"
      decoding="async"
      className={`pv-portrait ${className}`}
      data-testid="portrait"
    />
  );
}
