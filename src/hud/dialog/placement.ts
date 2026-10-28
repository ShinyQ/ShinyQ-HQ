import type { ViewportClass } from "@/experience/types";
import type { DialogView } from "./engine";

export type DialogPlacement = "bottom" | "raised" | "phone";

/**
 * Where the box sits: on fine pointers and touch tablets above the HUD bottom band's center column (point-and-go's
 * one-time "Click a glowing object" hint or its "Go to {label}" chip in InteractStatus, then the controls hint, which
 * hides while Rover speaks): 128 px on fine pointers (pill 44 + hint 40 + gaps and padding), above the joystick and
 * boost on touch tablets. Phones get the top toast (`TOAST_PLACE`) or, for a line with choices, the docked card.
 */
export function dialogPlacement(viewport: ViewportClass, coarse: boolean): DialogPlacement {
  if (!coarse) return "bottom";
  return viewport === "mobile" ? "phone" : "raised";
}

export const DIALOG_PLACE: Record<Exclude<DialogPlacement, "phone">, string> = {
  bottom: "bottom-[128px] left-1/2 w-[min(640px,calc(100%-2rem))] -translate-x-1/2",
  raised: "bottom-[160px] left-1/2 w-[min(560px,calc(100%-2rem))] -translate-x-1/2",
};

/**
 * A phone line without choices (owner decision 2026-10-28): a top toast, never over the rover, Boost or the joystick.
 * Portrait: full width below the minimap row (64 px plus the 72 px minimap, plus a gap). Landscape: at the top, between
 * the floor chip (its widest name, EN and ID) and the Ask and menu buttons, which also clears the minimap under them.
 */
export const TOAST_PLACE =
  "left-3 right-3 portrait:top-[calc(144px+env(safe-area-inset-top))] landscape:top-[calc(16px+env(safe-area-inset-top))] landscape:left-[216px] landscape:right-[128px]";

/** Docked on a phone (owner decision 2026-10-25): the box sits at the bottom in thumb reach, full width. */
export const DOCK_PLACE = "bottom-[calc(12px+env(safe-area-inset-bottom))] left-3 right-3";

/**
 * A phone line that asks for a choice (its own choices, or a try-it's Continue) docks at the bottom while it shows,
 * and the bottom band (joystick, Boost, Reset view) steps aside. Lines without choices stay the top toast.
 */
export function docks(view: Pick<DialogView, "line" | "paused" | "fallback">): boolean {
  return !view.paused && Boolean(view.line?.choices?.length || view.fallback);
}
