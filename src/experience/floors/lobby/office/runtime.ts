import { useSyncExternalStore } from "react";
import { OFFICE_DESKS } from "@/lib/office/protocol";

/**
 * Shared between the office scene (in the canvas) and its HUD chips, mutated outside React render: whether the
 * office is in view, the chip elements the scene moves every frame (HintProbe pattern) from their fixed world anchors
 * over the screen wall (`OFFICE_CHIP_ANCHORS`), whether each chip is far (a chip starts far and turns far again
 * whenever it hides, so at the office stop it only has to stay past the band's near edge) and whether they show as compact
 * dots outside the office view (`compact`, `officeChipMode`).
 */
export const officeRuntime = {
  inView: false,
  chips: Array.from({ length: OFFICE_DESKS }, (): HTMLElement | null => null),
  far: Array.from({ length: OFFICE_DESKS }, () => true),
  compact: false,
};

const farListeners = new Set<() => void>();
const notify = () => farListeners.forEach((listener) => listener());

export function setChipFar(slot: number, far: boolean): void {
  if (officeRuntime.far[slot] !== far) (officeRuntime.far[slot] = far), notify();
}

export function setChipsCompact(compact: boolean): void {
  if (officeRuntime.compact !== compact) (officeRuntime.compact = compact), notify();
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
