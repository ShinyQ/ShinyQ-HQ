/**
 * First 3D frame signal (pure: no React, no three). `Experience` marks the second rendered frame;
 * work that must not compete with the boot (room data) waits for it and then for an idle period.
 */
export type IdleScheduler = (cb: () => void, timeoutMs: number) => () => void;

const browserIdle: IdleScheduler = (cb, timeoutMs) => {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(() => cb(), { timeout: timeoutMs });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(cb, 200);
  return () => clearTimeout(id);
};

let framed = false;
const waiting = new Set<() => void>();

export function markFirstFrame(): void {
  if (framed) return;
  framed = true;
  for (const start of [...waiting]) start();
  waiting.clear();
}

export function resetFirstFrame(): void {
  framed = false;
  waiting.clear();
}

export function hasFirstFrame(): boolean {
  return framed;
}

/** Runs `cb` once, after the first frame and the next idle period (at most `timeoutMs` later). Returns a cancel function. */
export function afterFirstFrameIdle(cb: () => void, { timeoutMs = 2000, idle = browserIdle }: { timeoutMs?: number; idle?: IdleScheduler } = {}): () => void {
  let done = false;
  let cancelIdle: (() => void) | null = null;
  const start = () => {
    waiting.delete(start);
    cancelIdle = idle(() => {
      if (done) return;
      done = true;
      cb();
    }, timeoutMs);
  };
  if (framed) start();
  else waiting.add(start);
  return () => {
    done = true;
    waiting.delete(start);
    cancelIdle?.();
  };
}
