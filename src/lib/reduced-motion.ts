export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** The OS setting only; the effective flag also follows the visitor's Motion setting (`store.reducedMotion`, src/lib/motion.ts). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches ?? false);
}
