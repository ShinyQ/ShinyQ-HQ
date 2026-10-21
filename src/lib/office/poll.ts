import { OFFICE_PATH, parseOfficeResponse, type OfficeResponseV1, type OfficeResponseV2, type OfficeSnapshot, type OfficeSnapshotV1 } from "./protocol";

/**
 * Agent Office polling (owner decision D6, spec section 8), shared by the 3D office on L1 and the Classic home card.
 * Pure of React and three; timers, the clock, the page visibility and fetch are injectable for tests.
 */
export const POLL = { activeMs: 10_000, restingMs: 30_000, idleStopMs: 600_000, keepLastMs: 60_000 } as const;

/** The snapshot v2 request (desk helpers) the 3D office and the Classic card make. */
export const OFFICE_V2_PATH = `${OFFICE_PATH}?v=2`;

export type OfficeFeedStatus = "idle" | "loading" | "ready" | "offline" | "disabled";

/**
 * The v2 snapshot shape with either version number: the 3D office and the Classic card poll v2 (`OFFICE_V2_PATH`,
 * `parseOfficeResponseV2`), while unit fixtures and other callers may still hand in a v1 snapshot (whose desks simply
 * carry no `helpers`), so every consumer reads one type.
 */
export type OfficeFeedSnapshot = Omit<OfficeSnapshot, "v"> & { v: OfficeSnapshotV1["v"] | OfficeSnapshot["v"] };

export interface OfficeFeed {
  status: OfficeFeedStatus;
  snapshot: OfficeFeedSnapshot | null;
  /** `now()` of the last good response (0 before any). */
  fetchedAt: number;
}

export interface OfficePoller {
  /** Begin polling now (idempotent). */
  start(): void;
  /** Stop timers and abort the request in flight (keeps the last feed). */
  stop(): void;
  /** Visitor input: resets the 10 min idle stop, restarts if it had stopped for idleness. */
  touch(): void;
  feed(): OfficeFeed;
  subscribe(listener: (feed: OfficeFeed) => void): () => void;
}

export interface OfficePollerOptions {
  /** What to fetch (default `OFFICE_PATH`, v1); both clients ask `OFFICE_V2_PATH`. */
  path?: string;
  /** The body's validator for that path (default `parseOfficeResponse`, v1). */
  parse?: (raw: unknown) => OfficeResponseV1 | OfficeResponseV2 | null;
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
  const path = opts.path ?? OFFICE_PATH;
  const parse = opts.parse ?? parseOfficeResponse;
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
  let inflight: AbortController | null = null;

  const set = (next: OfficeFeed) => {
    current = next;
    for (const listener of listeners) {
      try {
        listener(next);
      } catch {
        // A failing subscriber must not stop the polling loop.
      }
    }
  };
  const clear = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  /** One request; its result is dropped when stop() or a restart changed the generation while it was in flight. */
  async function load(gen: number): Promise<void> {
    if (current.status === "idle") set({ ...current, status: "loading" });
    const controller = new AbortController();
    inflight = controller;
    // A hung request becomes an error after activeMs, so the keep-last then offline rule still applies.
    const abortTimer = setTimer(() => controller.abort(), POLL.activeMs);
    try {
      const res = await fetcher(path, { headers: { accept: "application/json" }, credentials: "omit", signal: controller.signal });
      if (res.status !== 200) throw new Error(`GET ${path}: ${res.status}`);
      const parsed = parse(await res.json());
      if (!parsed) throw new Error(`GET ${path}: invalid body`);
      if (gen !== generation) return;
      set(parsed.enabled ? { status: "ready", snapshot: parsed, fetchedAt: now() } : { status: "disabled", snapshot: null, fetchedAt: now() });
    } catch {
      if (gen !== generation) return;
      // The last good snapshot stays "ready" for keepLastMs, then the feed reports offline (it keeps the snapshot
      // for the last known GitHub events).
      const keep = current.snapshot !== null && now() - current.fetchedAt < POLL.keepLastMs;
      set({ ...current, status: keep ? "ready" : "offline" });
    } finally {
      clearTimer(abortTimer);
      if (inflight === controller) inflight = null;
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
    if (visible()) await load(gen);
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
      inflight?.abort();
      inflight = null;
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
