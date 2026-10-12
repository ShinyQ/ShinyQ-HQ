/**
 * Browser flags of the Rover dialog (localStorage): `hq:onboarded` (`done` or `skipped`, the
 * first-session tour ran) and `hq:hints` (`off` hides the "!" bubbles; missing means on). Blocked
 * storage keeps the value for this page, so a skipped tour does not come back on every frame.
 */
export const ONBOARDED_KEY = "hq:onboarded";
export const HINTS_KEY = "hq:hints";

export type OnboardingMark = "done" | "skipped";

export interface FlagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

let memoryOnboarded: OnboardingMark | null = null;
let memoryHints: boolean | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function local(): FlagStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function onboarded(storage: FlagStorage | null = local()): boolean {
  if (memoryOnboarded) return true;
  try {
    const value = storage?.getItem(ONBOARDED_KEY);
    return value === "done" || value === "skipped";
  } catch {
    return false;
  }
}

export function markOnboarded(mark: OnboardingMark, storage: FlagStorage | null = local()) {
  memoryOnboarded = mark;
  try {
    storage?.setItem(ONBOARDED_KEY, mark);
  } catch {
    // Remembered for this page only.
  }
  notify();
}

export function hintsOn(storage: FlagStorage | null = local()): boolean {
  if (memoryHints !== null) return memoryHints;
  try {
    return storage?.getItem(HINTS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHintsOn(on: boolean, storage: FlagStorage | null = local()) {
  memoryHints = on;
  try {
    storage?.setItem(HINTS_KEY, on ? "on" : "off");
  } catch {
    // Remembered for this page only.
  }
  notify();
}

export function subscribeFlags(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests: forget the in-memory copies. */
export function resetFlagMemory() {
  memoryOnboarded = null;
  memoryHints = null;
}
