import { useSyncExternalStore } from "react";
import { parseStatsSnapshot, type StatsSnapshotV1 } from "./contract";
import { freshness, type Freshness } from "./model";

/**
 * Client store for the public stats snapshot: one `GET /api/stats` per page load, started by
 * `requestStats()` (idle after the first 3D frame, or after hydration on the Classic site), validated
 * with the contract and its age. A 204, an error, an invalid body or a snapshot older than 7 days all
 * end in `hidden`, so every surface hides together.
 */
export const STATS_PATH = "/api/stats";

export type StatsFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type StatsStatus = "idle" | "loading" | "ready" | "hidden";

export interface StatsState {
  status: StatsStatus;
  snapshot: StatsSnapshotV1 | null;
  /** "delayed" shows a note; "hidden" never reaches `ready`. */
  freshness: Freshness;
}

const IDLE: StatsState = { status: "idle", snapshot: null, freshness: "hidden" };
const HIDDEN: StatsState = { status: "hidden", snapshot: null, freshness: "hidden" };

let state: StatsState = IDLE;
let pending: Promise<StatsState> | null = null;
const listeners = new Set<() => void>();

function set(next: StatsState): StatsState {
  state = next;
  listeners.forEach((l) => l());
  return next;
}

export function statsState(): StatsState {
  return state;
}

export function subscribeStats(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function load(fetcher: StatsFetcher, now: () => number): Promise<StatsState> {
  try {
    const res = await fetcher(STATS_PATH, { headers: { accept: "application/json" }, credentials: "omit" });
    if (res.status !== 200) return set(HIDDEN);
    const snapshot = parseStatsSnapshot(await res.json());
    const fresh = freshness(snapshot, now());
    return set(snapshot && fresh !== "hidden" ? { status: "ready", snapshot, freshness: fresh } : HIDDEN);
  } catch {
    return set(HIDDEN);
  }
}

/** Starts the one fetch of this page (later calls share it). */
export function requestStats(fetcher: StatsFetcher = (input, init) => fetch(input, init), now: () => number = Date.now): Promise<StatsState> {
  if (!pending) {
    set({ ...state, status: "loading" });
    pending = load(fetcher, now);
  }
  return pending;
}

const server = () => IDLE;

/** The current stats state (re-renders when the fetch settles). */
export function useStats(): StatsState {
  return useSyncExternalStore(subscribeStats, statsState, server);
}

/** Tests only: back to idle, or primed with a state (jsdom panels, the dev harness). */
export function __setStatsForTests(next: StatsState | null): void {
  pending = next ? Promise.resolve(next) : null;
  set(next ?? IDLE);
}
