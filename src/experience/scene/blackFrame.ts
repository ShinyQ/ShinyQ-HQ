/**
 * Pure helpers of the `?gfx=probe` black-frame probe (BlackFrameProbe.tsx): half-float decoding, a NaN and Inf scan
 * of a read-back HalfFloat buffer, and the visibility bisection that finds the object writing a bad pixel. No three,
 * no React, so Vitest runs them in node.
 */

/** IEEE 754 half (as read back into a Uint16Array) to a number. */
export function decodeHalf(u: number): number {
  const sign = u & 0x8000 ? -1 : 1;
  const exp = (u >> 10) & 0x1f;
  const frac = u & 0x3ff;
  if (exp === 0x1f) return frac ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  if (exp === 0) return sign * 2 ** -14 * (frac / 1024);
  return sign * 2 ** (exp - 15) * (1 + frac / 1024);
}

/** A half that is NaN or infinite (exponent all ones). */
export const halfNotFinite = (u: number): boolean => ((u >> 10) & 0x1f) === 0x1f;

export interface HalfScan {
  nan: number;
  inf: number;
  /** Largest finite channel value. */
  max: number;
  /** Pixel (x, y from the bottom, GL order) of the first NaN or Inf channel, or null. */
  first: [number, number] | null;
}

/** Counts NaN and Inf channels of an RGBA HalfFloat read-back `width` pixels wide. */
export function scanHalfRgba(data: Uint16Array, width: number): HalfScan {
  const out: HalfScan = { nan: 0, inf: 0, max: 0, first: null };
  for (let i = 0; i < data.length; i++) {
    const u = data[i];
    if (halfNotFinite(u)) {
      if (u & 0x3ff) out.nan += 1;
      else out.inf += 1;
      if (!out.first) {
        const p = i >> 2;
        out.first = [p % width, Math.floor(p / width)];
      }
      continue;
    }
    const v = decodeHalf(u);
    if (v > out.max) out.max = v;
  }
  return out;
}

/**
 * The single item of `items` that makes `bad(shown)` true, by halving: `bad` renders with only `shown` visible and
 * reports whether the bad pixel is back. Null when nothing (or only a combination) reproduces it.
 */
export function bisectCulprit<T>(items: readonly T[], bad: (shown: ReadonlySet<T>) => boolean): T | null {
  if (items.length === 0 || !bad(new Set(items))) return null;
  let candidates = items;
  while (candidates.length > 1) {
    const half = candidates.slice(0, candidates.length >> 1);
    const rest = candidates.slice(candidates.length >> 1);
    if (bad(new Set(half))) candidates = half;
    else if (bad(new Set(rest))) candidates = rest;
    else return null;
  }
  return candidates[0];
}

/** True when every sampled RGBA pixel has zero color (alpha ignored). */
export function allBlack(pixels: readonly (readonly number[])[]): boolean {
  return pixels.every((p) => p[0] === 0 && p[1] === 0 && p[2] === 0);
}
