/**
 * Motion preference. System follows `prefers-reduced-motion`, Full and Reduced override it.
 * Owner decision 2026-10-14: Full is the default for every visitor on every OS, because Windows
 * reports reduce whenever "Animation effects" is off, which turned every elevator ride into the
 * 150 ms cut. The OS preference is no longer the default; the Motion menu (System or Reduced)
 * restores it. Stored in the HQ store (`hq:v1`, `motion`); the head script mirrors it on
 * `html[data-motion]` before first paint so page CSS follows it too.
 */
export type MotionPref = "system" | "full" | "reduced";

export const MOTION_PREFS: readonly MotionPref[] = ["system", "full", "reduced"];

/** The Motion setting of a new visitor (owner decision 2026-10-14). */
export const DEFAULT_MOTION: MotionPref = "full";

/**
 * Store version that made Full the default. A stored `system` from an older version was the old
 * default, never a choice, so it migrates to Full; a `system` stored from this version on was picked.
 */
export const MOTION_FULL_DEFAULT_VERSION = 3;

/** `full` or `reduced` on <html> when the visitor's setting overrides the system; absent under System. */
export const MOTION_ATTR = "data-motion";

export function isMotionPref(value: unknown): value is MotionPref {
  return value === "system" || value === "full" || value === "reduced";
}

/** The effective reduced-motion flag every 3D and HUD consumer reads (`store.reducedMotion`). */
export function resolveReducedMotion(pref: MotionPref, systemReduced: boolean): boolean {
  return pref === "system" ? systemReduced : pref === "reduced";
}

/**
 * The persisted `motion` after an upgrade from store `version`: Reduced stays, a System stored before
 * Full became the default (and a missing or unknown value) becomes Full, a later System stays.
 */
export function migrateMotion(motion: unknown, version: number): MotionPref {
  if (motion === "reduced" || motion === "full") return motion;
  if (motion === "system" && version >= MOTION_FULL_DEFAULT_VERSION) return "system";
  return DEFAULT_MOTION;
}

export function applyMotionAttr(pref: MotionPref, root: HTMLElement | null = typeof document === "undefined" ? null : document.documentElement) {
  if (!root) return;
  if (pref === "system") root.removeAttribute(MOTION_ATTR);
  else root.setAttribute(MOTION_ATTR, pref);
}

/**
 * The `html[data-motion]` value for the persisted store JSON (`localStorage["hq:v1"]`): `full` for a
 * new visitor, unreadable data or a System stored before version 3 (see `migrateMotion`), `reduced`
 * when stored, and null only under a System picked from version 3 on. Self-contained (no imports, no
 * closures, the version inlined) so the head script inlines it via toString().
 */
export function storedMotion(raw: string | null): "full" | "reduced" | null {
  try {
    const saved = raw ? JSON.parse(raw) : null;
    const m = saved && saved.state ? saved.state.motion : null;
    if (m === "reduced") return "reduced";
    return m === "system" && Number(saved.version) >= 3 ? null : "full";
  } catch {
    return "full";
  }
}
