/**
 * The full boot and intro play on the first 3D load of every browser session, on any route, and
 * cannot be skipped (owner decision, October 2026). The flag lives in sessionStorage: later 3D loads
 * in the same tab open straight in, a new session (or tab) plays them again. Deep links and language
 * switches that start a new session play them too, then the rover continues to the linked floor or
 * room (`src/experience/introContinue.ts`).
 */
export const INTRO_KEY = "hq:intro";

export interface SessionLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function session(): SessionLike | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function introSeen(storage: SessionLike | null = session()): boolean {
  try {
    return storage?.getItem(INTRO_KEY) === "seen";
  } catch {
    return false;
  }
}

export function markIntroSeen(storage: SessionLike | null = session()): void {
  try {
    storage?.setItem(INTRO_KEY, "seen");
  } catch {
    // Storage can be unavailable; the intro then plays again on the next load.
  }
}

/** First phase of a Lobby session: the boot overlay until the intro played in this session, then explore. */
export function lobbyStartPhase(seen: boolean): "boot" | "explore" {
  return seen ? "explore" : "boot";
}
