import { useSyncExternalStore } from "react";
import { OFFICE_DESKS } from "@/lib/office/protocol";

/**
 * Shared between the office scene (in the canvas) and its HUD chips, mutated outside React render: whether the
 * office is in view, the chip elements the scene moves every frame (HintProbe pattern) from their fixed world anchors
 * over the screen wall (`OFFICE_CHIP_ANCHORS`), and whether each chip is far.
 */
export const officeRuntime = {
  inView: false,
  chips: Array.from({ length: OFFICE_DESKS }, (): HTMLElement | null => null),
  far: Array.from({ length: OFFICE_DESKS }, () => false),
};

const farListeners = new Set<() => void>();

export function setChipFar(slot: number, far: boolean): void {
  if (officeRuntime.far[slot] === far) return;
  officeRuntime.far[slot] = far;
  for (const listener of farListeners) listener();
}

export const subscribeChipFar = (listener: () => void): (() => void) => {
  farListeners.add(listener);
  return () => {
    farListeners.delete(listener);
  };
};

export function useChipFar(slot: number): boolean {
  return useSyncExternalStore(subscribeChipFar, () => officeRuntime.far[slot], () => false);
}
