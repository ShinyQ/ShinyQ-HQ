import { OFFICE_PATH, parseOfficeResponse, type OfficeSnapshotV1 } from "./protocol";

/**
 * Agent Office polling (owner decision D6, spec section 8), shared by the 3D office on L1 and the Classic home card.
 * Pure of React and three; timers, the clock, the page visibility and fetch are injectable for tests.
 */
export const POLL = { activeMs: 10_000, restingMs: 30_000, idleStopMs: 600_000, keepLastMs: 60_000 } as const;

export type OfficeFeedStatus = "idle" | "loading" | "ready" | "offline" | "disabled";

export interface OfficeFeed {
  status: OfficeFeedStatus;
  snapshot: OfficeSnapshotV1 | null;
  /** `now()` of the last good response (0 before any). */
  fetchedAt: number;
}

export interface OfficePoller {
  /** Begin polling now (idempotent). */
  start(): void;
  /** Stop timers (keeps the last feed). */
  stop(): void;
  /** Visitor input: resets the 10 min idle stop, restarts if it had stopped for idleness. */
  touch(): void;
  feed(): OfficeFeed;
  subscribe(listener: (feed: OfficeFeed) => void): () => void;
}

export interface OfficePollerOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  visible?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

const IDLE: OfficeFeed = { status: "idle", snapshot: null, fetchedAt: 0 };

function pageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

/** activeMs while a desk of a live snapshot is awake; restingMs for semi-live, off, every desk asleep or no snapshot. */
export function pollInterval(feed: OfficeFeed): number {
  const s = feed.snapshot;
  return s && s.mode === "live" && s.desks.some((d) => d.state !== "asleep") ? POLL.activeMs : POLL.restingMs;
}

export function createOfficePoller(opts: OfficePollerOptions = {}): OfficePoller {
  const fetcher = opts.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const now = opts.now ?? Date.now;
  const visible = opts.visible ?? pageVisible;
  const setTimer = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const listeners = new Set<(feed: OfficeFeed) => void>();
  let current: OfficeFeed = IDLE;
  let running = false;
  let idleStopped = false;
  let lastTouch = 0;
  let timer: unknown = null;
  let generation = 0;

  const set = (next: OfficeFeed) => {
    current = next;
    for (const listener of listeners) listener(next);
  };
  const clear = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  async function load(): Promise<void> {
    if (current.status === "idle") set({ ...current, status: "loading" });
    try {
      const res = await fetcher(OFFICE_PATH, { headers: { accept: "application/json" }, credentials: "omit" });
      if (res.status !== 200) throw new Error(`GET ${OFFICE_PATH}: ${res.status}`);
      const parsed = parseOfficeResponse(await res.json());
      if (!parsed) throw new Error(`GET ${OFFICE_PATH}: invalid body`);
      set(parsed.enabled ? { status: "ready", snapshot: parsed, fetchedAt: now() } : { status: "disabled", snapshot: null, fetchedAt: now() });
    } catch {
      // The last good snapshot stays "ready" for keepLastMs, then the feed reports offline (it keeps the snapshot
      // for the last known GitHub events).
      const keep = current.snapshot !== null && now() - current.fetchedAt < POLL.keepLastMs;
      set({ ...current, status: keep ? "ready" : "offline" });
    }
  }

  async function tick(gen: number): Promise<void> {
    timer = null;
    if (!running || gen !== generation) return;
    if (now() - lastTouch >= POLL.idleStopMs) {
      running = false;
      idleStopped = true;
      return;
    }
    if (visible()) await load();
    if (!running || gen !== generation) return;
    timer = setTimer(() => void tick(gen), pollInterval(current));
  }

  const poller: OfficePoller = {
    start() {
      if (running) return;
      running = true;
      idleStopped = false;
      lastTouch = now();
      generation += 1;
      void tick(generation);
    },
    stop() {
      running = false;
      idleStopped = false;
      generation += 1;
      clear();
    },
    touch() {
      lastTouch = now();
      if (idleStopped) poller.start();
    },
    feed: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return poller;
}
