/**
 * User activity counter for the rover idle behaviour. Any input bumps `seq`; the idle machine compares it
 * with the last value it saw and restarts its wait when it changes. No top-level DOM access (SSR safe).
 */

export const activity = { seq: 0 };

export function bumpActivity(): void {
  activity.seq += 1;
}

export const ACTIVITY_EVENTS = ["keydown", "pointerdown", "pointermove", "wheel", "touchstart"] as const;

/** Listens for user input on `target` and bumps the counter. Returns the cleanup (per-call handler, so a late cleanup of an old canvas never removes a new canvas's listeners). */
export function watchActivity(target: Pick<Document, "addEventListener" | "removeEventListener">): () => void {
  const options = { capture: true, passive: true } as const;
  const onInput = () => bumpActivity();
  for (const type of ACTIVITY_EVENTS) target.addEventListener(type, onInput, options);
  return () => {
    for (const type of ACTIVITY_EVENTS) target.removeEventListener(type, onInput, options);
  };
}
