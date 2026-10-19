import { useSyncExternalStore } from "react";
import { OFFICE_DESKS } from "@/lib/office/protocol";
import { LOBBY } from "../../../config";
import { OFFICE } from "../officeLayout";
import { OFFICE_SLOTS } from "../officeShell";

/**
 * The HTML chips hang up from fixed anchors on the screen wall's front face, `gap` (u) over its frame, at their Rovers'
 * x, desks 2 and 4 a `step` higher (two rows, so neighbours never share one and the row stays low): from the office
 * stop, on every camera class, they sit in the empty space over the wall and never cover its text, a desk screen or
 * the visitor's rover, and zoomed in until the middle three show their task lines (desktops and tablets; a phone keeps
 * them compact, `OfficeWatch`) they still clear the wall, each other and the HUD (tests/unit/office-chip-placement.test.ts).
 */
export const CHIP_ROW = { gap: 0.2, step: 2.2 } as const;

/** A chip's top never goes above this (px): under the HUD's top bar (62 px desktop, 58 px phones), so `OfficeWatch` clamps there. */
export const OFFICE_CHIP_TOP = { desktop: 66, mobile: 64 } as const;

/** A chip farther than this from the camera shows its first line only (the mock's `.tag.far`). */
export const OFFICE_CHIP_FAR = 30;
/** Half-width of the near/far band, so a camera hovering at the threshold does not flip the chip every frame. */
export const OFFICE_CHIP_FAR_BAND = 1;

/**
 * The next far flag for a chip at `dist` from the camera: far above 31, near below 29, unchanged between. On a phone
 * (`phone`) always far: there is no room for task lines over the wall, and the desk's drawer shows them.
 */
export function nextChipFar(far: boolean, dist: number, phone = false): boolean {
  return phone || (far ? dist > OFFICE_CHIP_FAR - OFFICE_CHIP_FAR_BAND : dist > OFFICE_CHIP_FAR + OFFICE_CHIP_FAR_BAND);
}

/**
 * Shared between the office scene (in the canvas) and its HUD chips, mutated outside React render: whether the
 * office is in view, the chip elements the scene moves every frame (HintProbe pattern), their fixed world anchors
 * over the screen wall, and whether each chip is far.
 */
export const officeRuntime = {
  inView: false,
  chips: Array.from({ length: OFFICE_DESKS }, (): HTMLElement | null => null),
  anchors: OFFICE_SLOTS.map((s) => ({
    x: s.rover.x,
    y: OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame + CHIP_ROW.gap + CHIP_ROW.step * (s.slot % 2),
    z: LOBBY.officeWing.wall.z - OFFICE.wall.t / 2,
  })),
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
