/**
 * Motion preference (owner decision, October 2026): System follows `prefers-reduced-motion`, Full and
 * Reduced override it. Windows reports reduce whenever "Animation effects" is off, which used to turn
 * every elevator ride into the 150 ms cut. Stored in the HQ store (`hq:v1`, `motion`); the head script
 * mirrors it on `html[data-motion]` before first paint so page CSS follows it too.
 */
export type MotionPref = "system" | "full" | "reduced";

export const MOTION_PREFS: readonly MotionPref[] = ["system", "full", "reduced"];

/** `full` or `reduced` on <html> when the visitor overrides the system; absent under System. */
export const MOTION_ATTR = "data-motion";

/** localStorage flag of the one-time "your system reduces motion" hint in the 3D HUD. */
export const MOTION_HINT_KEY = "hq:motion-hint";

export function isMotionPref(value: unknown): value is MotionPref {
  return value === "system" || value === "full" || value === "reduced";
}

/** The effective reduced-motion flag every 3D and HUD consumer reads (`store.reducedMotion`). */
export function resolveReducedMotion(pref: MotionPref, systemReduced: boolean): boolean {
  return pref === "system" ? systemReduced : pref === "reduced";
}

export function applyMotionAttr(pref: MotionPref, root: HTMLElement | null = typeof document === "undefined" ? null : document.documentElement) {
  if (!root) return;
  if (pref === "system") root.removeAttribute(MOTION_ATTR);
  else root.setAttribute(MOTION_ATTR, pref);
}

/**
 * The override stored in the persisted store JSON (`localStorage["hq:v1"]`), or null under System or
 * on unreadable data. Self-contained (no imports, no closures) so the head script inlines it via toString().
 */
export function storedMotion(raw: string | null): "full" | "reduced" | null {
  try {
    const m = raw ? JSON.parse(raw).state.motion : null;
    return m === "full" || m === "reduced" ? m : null;
  } catch {
    return null;
  }
}

export function motionHintSeen(): boolean {
  try {
    return localStorage.getItem(MOTION_HINT_KEY) === "seen";
  } catch {
    return true;
  }
}

export function markMotionHintSeen() {
  try {
    localStorage.setItem(MOTION_HINT_KEY, "seen");
  } catch {
    // Without storage the hint may come back next visit.
  }
}
