import { useSyncExternalStore } from "react";
import { OFFICE_DESKS } from "@/lib/office/protocol";
import type { CrewActor } from "./crew";

/**
 * Shared between the office scene (in the canvas) and its HUD chips, mutated outside React render: whether the
 * office is in view, the chip elements the scene moves every frame (HintProbe pattern) along the row under the top bar,
 * each over its Rover's head (`OFFICE_CHIP_ANCHORS`), and their leader lines down to the heads (`leads`), whether each
 * chip is far (a chip starts far and turns far again whenever it hides, so at the office stop it only has to stay past
 * the band's near edge), whether they show as compact dots outside the office view (`compact`, `officeChipMode`) and the
 * crew actors (read by the probe).
 */
export const officeRuntime = {
  inView: false,
  chips: Array.from({ length: OFFICE_DESKS }, (): HTMLElement | null => null),
  leads: Array.from({ length: OFFICE_DESKS }, (): HTMLElement | null => null),
  far: Array.from({ length: OFFICE_DESKS }, () => true),
  compact: false,
  /** The scene's crew actors in slot order (empty while the Rovers are not mounted). */
  crew: [] as CrewActor[],
};

const farListeners = new Set<() => void>();
const notify = () => farListeners.forEach((listener) => listener());

export function setChipFar(slot: number, far: boolean): void {
  if (officeRuntime.far[slot] === far) return;
  officeRuntime.far[slot] = far;
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
  return useSyncExternalStore(subscribeChipFar, () => officeRuntime.far[slot], () => true);
}

export function useChipsCompact(): boolean {
  return useSyncExternalStore(subscribeChipFar, () => officeRuntime.compact, () => false);
}
