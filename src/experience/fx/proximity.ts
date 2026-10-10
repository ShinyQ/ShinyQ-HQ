/** Door glow level by rover distance: 0.15 at 6 u or more, 0.8 at 1.5 u or less, linear between. */
export function proximityLevel(distance: number): number {
  const t = Math.min(1, Math.max(0, (6 - distance) / 4.5));
  return 0.15 + t * 0.65;
}
