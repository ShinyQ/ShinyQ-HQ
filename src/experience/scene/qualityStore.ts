import type { MonitorAction } from "./frameMonitor";
import type { QualityState } from "./quality";

export interface QualitySnapshot {
  level: number;
  locked: boolean;
  /** Level changes in this page load. */
  flips: number;
  last: MonitorAction | null;
}

const KEY = "hq:gfx";
const START: QualitySnapshot = { level: 0, locked: false, flips: 0, last: null };

function load(): QualitySnapshot {
  if (typeof window === "undefined") return START;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return START;
    const v = JSON.parse(raw) as { level?: unknown; locked?: unknown };
    if (typeof v.level === "number" && Number.isInteger(v.level) && v.level >= 0 && v.level <= 8) return { level: v.level, locked: v.locked === true, flips: 0, last: null };
  } catch {
    // corrupt or blocked storage: start from the plain budget
  }
  return START;
}

let snapshot: QualitySnapshot | null = null;
let applied: QualityState | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

/** Quality level of the safety net (session-scoped) and what is applied now. Not in the HQ store: it changes outside React and must not re-render the HUD. */
export const qualityStore = {
  get(): QualitySnapshot {
    snapshot ??= load();
    return snapshot;
  },
  set(next: QualitySnapshot): void {
    snapshot = next;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ level: next.level, locked: next.locked }));
    } catch {
      // storage blocked: the level still applies to this page load
    }
    notify();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setApplied(next: QualityState | null): void {
    const changed = next?.dpr !== applied?.dpr || next?.multisampling !== applied?.multisampling || next?.bloomLevels !== applied?.bloomLevels;
    applied = next;
    if (changed) notify();
  },
  applied(): QualityState | null {
    return applied;
  },
  /** Forgets the in-memory state (tests, and a fresh `Experience` mount re-reads the session). */
  reset(): void {
    snapshot = null;
    applied = null;
  },
};

/** Test hook: the monitor sees this frame time (ms) instead of the real one while set. */
export const qualityDebug = { simulateFrameMs: null as number | null };

/** `window.__hq.quality`: tests, the perf script and the P4 overlay read it. */
export const qualityHandle = {
  snapshot: () => ({ ...qualityStore.get(), applied: qualityStore.applied() }),
  simulate(ms: number | null): void {
    qualityDebug.simulateFrameMs = ms;
  },
};
