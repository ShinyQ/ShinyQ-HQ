import type { Interactable } from "./source";

export interface HintTarget {
  item: Interactable;
  anchor: { x: number; y: number; z: number };
}

/**
 * Shared between HintProbe (in the canvas) and the HUD bubble: the picked target and the bubble
 * element the probe moves every frame. Mutated outside React render.
 */
export const hintRuntime = {
  target: null as HintTarget | null,
  element: null as HTMLElement | null,
};

const listeners = new Set<() => void>();

/** Sets the picked target; listeners hear about it only when a different target is picked. */
export function setHintTarget(next: HintTarget | null) {
  const changed = (hintRuntime.target?.item.id ?? null) !== (next?.item.id ?? null);
  hintRuntime.target = next;
  if (changed) listeners.forEach((listener) => listener());
}

export function subscribeHintTarget(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function registerHintElement(element: HTMLElement | null) {
  hintRuntime.element = element;
}
