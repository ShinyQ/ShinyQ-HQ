import type { FloorId, MissionStep, RoomId } from "@/content/schema";
import type { MissionStatus, PaletteFilter, Vec2 } from "./host";

/**
 * Guided walks (owner decision: L2 "Walk my journey", L3 "Tour my projects"). A walk is an ordered
 * list of stops on one floor with Prev / Open / Next / End, optional filters and visited marks kept
 * in localStorage. Each leg runs as a mission (`elevator` then `drive`, then `open` when the walk
 * auto-opens rooms), so the 3D host drives along the floor's road and manual input cancels it the
 * same way it cancels any mission: the walk then pauses ("Resume walk" pill).
 *
 * Pure TypeScript (no React, store or three): the world is reached only through `WalkHost`.
 */

export interface WalkStop {
  /** Stable id (the room id for room stops); visited marks and resume use it. */
  id: string;
  /** Where the rover drives: a room door or a point (for example a directory board). */
  to: RoomId | Vec2;
  /** Room that Open shows (and that opens on arrival when the walk auto-opens). */
  room?: RoomId;
  /** Open shows the command palette with this filter instead of a room (directory stops). */
  palette?: PaletteFilter;
  title: string;
  subtitle?: string;
  /** Group label shown before the title, for example the year or the wing. */
  group?: string;
  /** Filter ids this stop belongs to. */
  tags?: readonly string[];
}

export interface WalkFilter {
  id: string;
  label: string;
}

export interface WalkDefinition {
  /** Storage key suffix and mission id suffix ("journey", "projects"). */
  id: string;
  floor: FloorId;
  stops: readonly WalkStop[];
  filters?: readonly WalkFilter[];
  /** Open each stop's room on arrival (default true). */
  autoOpen?: boolean;
}

export type WalkStatus = "idle" | "driving" | "arrived" | "paused" | "done";

export interface WalkState {
  status: WalkStatus;
  filter: string | null;
  /** Position in the filtered stop list. */
  index: number;
  total: number;
  stop: WalkStop | null;
  /** Ids of visited stops (all filters). */
  visited: readonly string[];
}

/** What a walk needs from the world: run a leg as a mission, and cancel it. */
export interface WalkHost {
  run(id: string, steps: MissionStep[]): Promise<MissionStatus>;
  cancel(): void;
}

export interface WalkStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Saved progress (`localStorage["hq:walk:<id>"]`). */
export interface WalkProgress {
  stop: string | null;
  filter: string | null;
  visited: string[];
  done: boolean;
}

export interface WalkController {
  readonly definition: WalkDefinition;
  readonly state: WalkState;
  /** Stops under the current filter. */
  stops(): readonly WalkStop[];
  /** Saved progress, if any. */
  saved(): WalkProgress | null;
  /** Starts at the saved stop (or the first one with `restart`) and drives there. */
  start(options?: { restart?: boolean; filter?: string | null }): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  go(index: number): Promise<void>;
  /** Opens the current stop (drives there first when the rover is not at it). */
  open(): Promise<void>;
  /** Manual input: stops the autopilot and minimizes to the "Resume walk" pill. */
  pause(): void;
  /** Drives back to the current stop after a pause. */
  resume(): Promise<void>;
  /** Leaves the walk; progress stays saved for the next start. */
  end(): void;
  setFilter(filter: string | null): Promise<void>;
  subscribe(listener: (state: WalkState) => void): () => void;
}

export const WALK_STORAGE_PREFIX = "hq:walk:";

const memoryStorage = (): WalkStorage => {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
};

function defaultStorage(): WalkStorage {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Storage blocked (private mode): progress lives for this page only.
  }
  return memoryStorage();
}

/** Stops matching `filter` (all stops without one), in walk order. */
export function filterStops(stops: readonly WalkStop[], filter: string | null): WalkStop[] {
  return filter ? stops.filter((s) => s.tags?.includes(filter)) : [...stops];
}

function readProgress(storage: WalkStorage, key: string): WalkProgress | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<WalkProgress>;
    return {
      stop: typeof value.stop === "string" ? value.stop : null,
      filter: typeof value.filter === "string" ? value.filter : null,
      visited: Array.isArray(value.visited) ? value.visited.filter((v): v is string => typeof v === "string") : [],
      done: value.done === true,
    };
  } catch {
    return null;
  }
}

export function createWalk(definition: WalkDefinition, host: WalkHost, { storage = defaultStorage() }: { storage?: WalkStorage } = {}): WalkController {
  const key = `${WALK_STORAGE_PREFIX}${definition.id}`;
  const missionId = `walk:${definition.id}`;
  const autoOpen = definition.autoOpen ?? true;
  const filters = new Set((definition.filters ?? []).map((f) => f.id));
  const listeners = new Set<(state: WalkState) => void>();
  const initial = readProgress(storage, key);
  let progressDone = initial?.done ?? false;
  let list = filterStops(definition.stops, initial?.filter && filters.has(initial.filter) ? initial.filter : null);
  let state: WalkState = {
    status: "idle",
    filter: initial?.filter && filters.has(initial.filter) ? initial.filter : null,
    index: Math.max(0, list.findIndex((s) => s.id === initial?.stop)),
    total: list.length,
    stop: null,
    visited: initial?.visited ?? [],
  };
  state.stop = list[state.index] ?? null;
  /** Bumped by every new leg and by pause/end, so a stale leg result is ignored. */
  let leg = 0;

  const persist = () => {
    try {
      const progress: WalkProgress = { stop: state.stop?.id ?? null, filter: state.filter, visited: [...state.visited], done: progressDone };
      storage.setItem(key, JSON.stringify(progress));
    } catch {
      // Quota or privacy mode: the walk still works for this visit.
    }
  };

  const set = (patch: Partial<WalkState>) => {
    state = { ...state, ...patch };
    state.total = list.length;
    state.stop = list[state.index] ?? null;
    for (const listener of listeners) listener(state);
  };

  const openSteps = (stop: WalkStop): MissionStep[] => {
    if (stop.room) return [{ kind: "open", room: stop.room }];
    if (stop.palette) return [{ kind: "palette", filter: stop.palette }];
    return [];
  };

  /** `open`: true opens any stop on arrival; by default only rooms open, and only when the walk auto-opens. */
  const travel = async (index: number, { open }: { open?: boolean } = {}) => {
    const stop = list[index];
    if (!stop) return;
    const mine = ++leg;
    progressDone = false;
    set({ status: "driving", index });
    persist();
    const steps: MissionStep[] = [{ kind: "elevator", floor: definition.floor }, { kind: "drive", to: stop.to }, ...(open || (open === undefined && autoOpen && stop.room) ? openSteps(stop) : [])];
    const result = await host.run(missionId, steps);
    if (mine !== leg) return;
    if (result === "done") {
      const visited = state.visited.includes(stop.id) ? state.visited : [...state.visited, stop.id];
      set({ status: "arrived", visited });
      persist();
    } else set({ status: "paused" });
  };

  const stopLeg = () => {
    leg += 1;
    if (state.status === "driving") host.cancel();
  };

  return {
    definition,
    get state() {
      return state;
    },
    stops: () => list,
    saved: () => readProgress(storage, key),
    async start({ restart = false, filter }: { restart?: boolean; filter?: string | null } = {}) {
      if (filter !== undefined) {
        const next = filter && filters.has(filter) ? filter : null;
        list = filterStops(definition.stops, next);
        set({ filter: next });
      }
      const saved = readProgress(storage, key);
      const at = restart || !saved || saved.done ? 0 : Math.max(0, list.findIndex((s) => s.id === saved.stop));
      await travel(at);
    },
    next() {
      if (state.index >= list.length - 1) {
        stopLeg();
        progressDone = true;
        set({ status: "done" });
        persist();
        return Promise.resolve();
      }
      return travel(state.index + 1);
    },
    prev() {
      return state.index > 0 ? travel(state.index - 1) : travel(0);
    },
    go(index) {
      return travel(Math.max(0, Math.min(list.length - 1, index)));
    },
    async open() {
      const stop = state.stop;
      if (!stop) return;
      if (state.status !== "arrived") return travel(state.index, { open: true });
      const steps = openSteps(stop);
      if (steps.length) await host.run(`${missionId}:open`, steps);
    },
    pause() {
      if (state.status !== "driving" && state.status !== "arrived") return;
      stopLeg();
      set({ status: "paused" });
    },
    resume() {
      return travel(state.index);
    },
    end() {
      stopLeg();
      set({ status: "idle" });
      persist();
    },
    async setFilter(filter) {
      const next = filter && filters.has(filter) ? filter : null;
      if (next === state.filter) return;
      const current = state.stop;
      const order = (s: WalkStop | null) => (s ? definition.stops.findIndex((x) => x.id === s.id) : -1);
      list = filterStops(definition.stops, next);
      let index = list.findIndex((s) => s.id === current?.id);
      if (index < 0) index = Math.max(0, list.findIndex((s) => order(s) >= order(current)));
      const driving = state.status === "driving";
      set({ filter: next, index });
      persist();
      if (driving) await travel(index);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Whether a first-visit walk prompt was already shown on `floor` (`localStorage["hq:walk-prompt"]`). */
export const WALK_PROMPT_KEY = "hq:walk-prompt";

export function promptSeen(floor: FloorId, storage: WalkStorage = defaultStorage()): boolean {
  try {
    const raw = storage.getItem(WALK_PROMPT_KEY);
    return Boolean(raw && (JSON.parse(raw) as unknown[]).includes(floor));
  } catch {
    return false;
  }
}

export function markPromptSeen(floor: FloorId, storage: WalkStorage = defaultStorage()) {
  try {
    const raw = storage.getItem(WALK_PROMPT_KEY);
    const seen = raw ? (JSON.parse(raw) as FloorId[]) : [];
    if (!seen.includes(floor)) storage.setItem(WALK_PROMPT_KEY, JSON.stringify([...seen, floor]));
  } catch {
    // Not remembered: the prompt shows again next visit.
  }
}
