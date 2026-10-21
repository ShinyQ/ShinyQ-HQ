import { useSyncExternalStore } from "react";
import { OFFICE_DESKS, OFFICE_SEATS } from "@/lib/office/protocol";
import type { CrewActor } from "./crew";

/** Chips in the row under the top bar: the front row's desks (slots 0 to 4); the back row's Rovers have none yet. */
export const OFFICE_CHIP_COUNT = OFFICE_DESKS;

/**
 * Shared between the office scene (in the canvas) and its HUD chips, mutated outside React render: whether the
 * office is in view, the camera's distance to the office bounds and whether that is past `OFFICE_LOD.farDistance` (the
 * far level of detail; `OfficeWatch` writes the three every 0.5 s), the chip elements the scene moves every frame (HintProbe pattern) along the row under the top bar,
 * each over its Rover's head (`OFFICE_CHIP_ANCHORS`), and their leader lines toward the heads (`leads`, ending at the screen wall's top with a tick, `ticks`), whether each
 * chip is far (`chipFar`: a chip starts far and turns far again whenever it hides, so at the office stop it only has to stay past
 * the band's near edge), whether they show as compact dots outside the office view (`compact`, `officeChipMode`) and the
 * crew actors (read by the probe).
 */
export const officeRuntime = {
  inView: false,
  /** The camera's distance to the office bounds (u), refreshed every 0.5 s while the scene is mounted. */
  distance: Infinity,
  /** In the far level of detail (`distance` past `OFFICE_LOD.farDistance`): the crew and the effects step at `OFFICE_LOD.farHz`. */
  far: true,
  chips: Array.from({ length: OFFICE_SEATS }, (): HTMLElement | null => null),
  leads: Array.from({ length: OFFICE_SEATS }, (): HTMLElement | null => null),
  /** The ticks where the leader lines meet the screen wall's top. */
  ticks: Array.from({ length: OFFICE_SEATS }, (): HTMLElement | null => null),
  chipFar: Array.from({ length: OFFICE_SEATS }, () => true),
  compact: false,
  /** The scene's crew actors in slot order (empty while the Rovers are not mounted). */
  crew: [] as CrewActor[],
};

const farListeners = new Set<() => void>();
const notify = () => farListeners.forEach((listener) => listener());

export function setChipFar(slot: number, far: boolean): void {
  if (officeRuntime.chipFar[slot] === far) return;
  officeRuntime.chipFar[slot] = far;
  notify();
}

export function setChipsCompact(compact: boolean): void {
  if (officeRuntime.compact === compact) return;
  officeRuntime.compact = compact;
  notify();
}

export const subscribeChipFar = (listener: () => void): (() => void) => {
  farListeners.add(listener);
  return () => {
    farListeners.delete(listener);
  };
};

export function useChipFar(slot: number): boolean {
  return useSyncExternalStore(subscribeChipFar, () => officeRuntime.chipFar[slot], () => true);
}

export function useChipsCompact(): boolean {
  return useSyncExternalStore(subscribeChipFar, () => officeRuntime.compact, () => false);
}
