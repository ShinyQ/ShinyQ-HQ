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

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHallPremium(): HallPremiumModule | null {
  return useSyncExternalStore(subscribe, () => loaded, () => null);
}

/** True until the first load starts (the trigger asks only then). */
export const hallPremiumIdle = () => state === "idle";

export interface HallPremiumLoadInput {
  floor: FloorId;
  /** Rover x (floor-local). */
  x: number;
  /** The first frame went idle and speculative prefetch is on (`?prefetch=off` turns the idle load off). */
  idle: boolean;
  /** A hall intent: a station room open (a deep link, Cmd-K). A drive heading into the hall counts through `x` (its target's). */
  intent: boolean;
}

/** When the interiors load: on L1 only, at idle, on a hall intent, or once the rover heads for the hall (`HALL.lazyX`). */
export function shouldLoadHallPremium({ floor, x, idle, intent }: HallPremiumLoadInput): boolean {
  if (floor !== "L1") return false;
  return idle || intent || x > HALL.lazyX;
}

/** `window.__hq.hall` (Playwright, the bytes, perf and memory gates): load the interiors (their state is `__hq.probes.hallPremium`). */
export const hallHandle = {
  loadPremium: (): Promise<void> => loadHallPremium().then(() => undefined),
};

/** What `HighlightsHall` hands the interiors of one hall part (`HallView`), so they hide with it. */
export interface HallPremiumProps {
  part: "north" | "contact" | "south";
  tier: import("../../../types").GpuTier;
  reducedMotion: boolean;
  data: import("../../../types").ExperienceData;
  labels: import("../hallContent").HallLabels;
  /** This part's texts in batch order and its text batch handle (the wake morphs), and the hall's screenshot atlas once loaded. */
  texts: import("../hallContent").HallTexts;
  handle: import("react").RefObject<import("../../../fx/BatchedLabels").BatchedLabelsHandle | null>;
  map: import("three").Texture | null;
}
