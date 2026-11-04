/** Seconds a station takes to wake (the case brightens, the content assembles) and to settle back. */
export const WAKE = { rise: 0.8, fall: 1.6 } as const;

/**
 * A station's wake level after `dt` seconds (0 asleep to 1 awake): it rises while the rover is docked on the station's
 * pad and settles back after it leaves. Reduced motion jumps without animation.
 */
export function wakeLevel(prev: number, docked: boolean, dt: number, reduced: boolean): number {
  if (reduced) return docked ? 1 : 0;
  const next = docked ? prev + dt / WAKE.rise : prev - dt / WAKE.fall;
  return Math.min(1, Math.max(0, next));
}

/** Smooth step of a wake level (assembly easing). */
export function eased(w: number): number {
  return w * w * (3 - 2 * w);
}
