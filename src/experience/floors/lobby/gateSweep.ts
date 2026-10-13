/**
 * The gateway arch's light curtain sweeps once per browser session, the first time the rover drives
 * through it into the Highlights Hall (`sessionStorage["hq:hall-gate"]`). Reduced motion never sweeps.
 */
export const GATE_SWEEP_KEY = "hq:hall-gate";
/** Length of the sweep (s). */
export const GATE_SWEEP_SECONDS = 0.8;

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

export function gateSwept(storage: SessionLike | null = session()): boolean {
  try {
    return storage?.getItem(GATE_SWEEP_KEY) === "seen";
  } catch {
    return false;
  }
}

export function markGateSwept(storage: SessionLike | null = session()): void {
  try {
    storage?.setItem(GATE_SWEEP_KEY, "seen");
  } catch {
    // Storage can be unavailable; the sweep then plays again on the next load.
  }
}

/** Sweep progress 0 to 1 after `elapsed` seconds, or null once it is over. */
export function sweepProgress(elapsed: number): number | null {
  return elapsed >= GATE_SWEEP_SECONDS ? null : Math.max(0, elapsed / GATE_SWEEP_SECONDS);
}
