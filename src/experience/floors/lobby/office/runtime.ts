import { useSyncExternalStore } from "react";
import { OFFICE_DESKS } from "@/lib/office/protocol";
import { officeSlots } from "../officeLayout";
import { CHIP_LIFT } from "./officeRig";

/** A chip farther than this from the camera shows its first line only (the mock's `.tag.far`). */
export const OFFICE_CHIP_FAR = 28;

/**
 * Shared between the office scene (in the canvas) and its HUD chips, mutated outside React render: whether the
 * office is in view, the chip elements the scene moves every frame (HintProbe pattern), their world anchors
 * above each Rover, and whether each chip is far.
 */
export const officeRuntime = {
  inView: false,
  chips: Array.from({ length: OFFICE_DESKS }, (): HTMLElement | null => null),
  anchors: officeSlots().map((s) => ({ x: s.rover.x, y: CHIP_LIFT, z: s.rover.z })),
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
