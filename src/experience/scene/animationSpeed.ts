/**
 * Test-only animation speed. Functional e2e specs set `window.__hqE2ESpeed` before any page script
 * (`fastAnimations` in e2e/hq.ts) so elevator rides, autopilot drives, beams, camera eases and the intro
 * run that many times faster in game time; manual input, closed-door waits and decorative clocks keep
 * real time. Always 1 for visitors (no `navigator.webdriver`) and in the perf lane (never sets the flag).
 * Read once per frame, so a test can drop back to real speed mid-test.
 */
export const MAX_ANIMATION_SPEED = 8;

type SpeedWindow = { __hqE2ESpeed?: unknown };

export function animationSpeed(): number {
  if (typeof window === "undefined" || typeof navigator === "undefined" || navigator.webdriver !== true) return 1;
  const speed = (window as unknown as SpeedWindow).__hqE2ESpeed;
  return typeof speed === "number" && speed > 1 ? Math.min(speed, MAX_ANIMATION_SPEED) : 1;
}
