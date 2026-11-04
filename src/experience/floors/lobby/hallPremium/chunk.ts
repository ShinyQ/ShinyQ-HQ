import { useSyncExternalStore } from "react";
import type { FloorId } from "@/content/schema";
import { sceneProbes } from "../../../fx/probes";
import { HALL } from "../hallLayout";
import type * as HallPremiumChunk from "./scene";

/**
 * The Highlights Hall interiors chunk (`./scene.ts`, owner decision 2026-11-04: a lazy premium chunk, about 12 KB gzip):
 * the glass cases and what each station shows inside. Until it loads, the stations show their main-path look.
 */
export type HallPremiumModule = typeof HallPremiumChunk;
export type HallPremiumState = "idle" | "loading" | "ready" | "failed";

let pending: Promise<HallPremiumModule> | null = null;
let loaded: HallPremiumModule | null = null;
let state: HallPremiumState = "idle";
const listeners = new Set<() => void>();

const set = (next: HallPremiumState) => {
  state = next;
  sceneProbes.hallPremium.state = next;
  for (const listener of listeners) listener();
};

/** Loads the hall interiors once per page; a failed import is forgotten, so the next request retries. The only reference to the chunk entry. */
export function loadHallPremium(): Promise<HallPremiumModule> {
  if (!pending) {
    set("loading");
    pending = import("./scene").then(
      (mod) => {
        loaded = mod;
        set("ready");
        return mod;
      },
      (error: unknown) => {
        pending = null;
        set("failed");
        throw error;
      },
    );
  }
  return pending;
}

export function hallPremiumModule(): HallPremiumModule | null {
  return loaded;
}

export function hallPremiumState(): HallPremiumState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHallPremium(): HallPremiumModule | null {
  return useSyncExternalStore(subscribe, hallPremiumModule, () => null);
}

export interface HallPremiumLoadInput {
  floor: FloorId;
  /** Rover x (floor-local). */
  x: number;
  /** The first frame went idle and speculative prefetch is on (`?prefetch=off` turns the idle load off). */
  idle: boolean;
  /** A hall intent: a drive heading into the hall (point-and-go, Cmd-K, a mission) or a station room open (a deep link). */
  intent: boolean;
}

/** When the interiors load: on L1 only, at idle, on a hall intent, or once the rover heads for the hall (`HALL.lazyX`). */
export function shouldLoadHallPremium({ floor, x, idle, intent }: HallPremiumLoadInput): boolean {
  if (floor !== "L1") return false;
  return idle || intent || x > HALL.lazyX;
}

/** True when a floor-local point lies in the hall (a drive's target there is a hall intent). */
export function inHall(p: { x: number; z: number }): boolean {
  const z = HALL.zone;
  return p.x >= z.minX && p.x <= z.maxX && p.z >= z.minZ && p.z <= z.maxZ;
}

/** `window.__hq.hall` (Playwright, the bytes, perf and memory gates): load the interiors, and their state. */
export const hallHandle = {
  loadPremium: (): Promise<void> => loadHallPremium().then(() => undefined),
  premiumState: hallPremiumState,
};

/** What `HighlightsHall` hands the interiors of one hall part (`HallView`), so they hide with it. */
export interface HallPremiumProps {
  part: "north" | "contact" | "south";
  tier: import("../../../types").GpuTier;
  reducedMotion: boolean;
  data: import("../../../types").ExperienceData;
  labels: import("../hallContent").HallLabels;
  /** The north part's text batch and its About me stat value members, counted up on that station's wake. */
  countUp?: { handle: import("react").RefObject<import("../../../fx/BatchedLabels").BatchedLabelsHandle | null>; members: readonly number[]; values: readonly string[] };
}
