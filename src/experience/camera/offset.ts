import type { ViewportClass } from "../types";

/** Prototype camera pull-back by aspect: x1 on wide screens, x1.35 near square, x1.75 on portrait. */
export const cameraOffsetScale = (aspect: number): number => (aspect < 0.8 ? 1.75 : aspect < 1.2 ? 1.35 : 1);

/** Aspect each camera class's offset and FOV are tuned for (appendix 03 section 2). */
const CLASS_ASPECT: Record<ViewportClass, number> = { desktop: 16 / 9, tablet: 4 / 3, mobile: 9 / 19.5 };

/**
 * Follow offset multiplier. The camera classes already pull back on portrait screens (wider FOV,
 * higher offset), so only the part of the prototype scale the class does not cover is applied.
 */
export function followOffsetScale(cls: ViewportClass, aspect: number): number {
  return cameraOffsetScale(aspect) / cameraOffsetScale(CLASS_ASPECT[cls]);
}

/** Prototype follow smoothing `1 - exp(-dt * 4)`, twice as fast under reduced motion. */
export function followEase(dt: number, reduced: boolean): number {
  return 1 - Math.exp(-dt * (reduced ? 8 : 4));
}
