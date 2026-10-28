import type { CSSProperties } from "react";
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
 * Portrait: full width below the minimap row (64 px plus the 72 px minimap, plus a gap). Landscape (a phone's camera
 * class is `tablet` there): at the top, between the floor chip (its widest name, B1 in Indonesian, ends at 179 px) and
 * the Ask and menu buttons (Ask starts about 120 px from the right edge), which also clears the minimap under them and
 * the L2 year chip (ends at 163 px). An inline style, not utilities: these rules would ship in the Classic stylesheet.
 */
export function toastPlace(landscape: boolean): CSSProperties {
  return landscape
    ? { top: "calc(16px + env(safe-area-inset-top))", left: 188, right: 128 }
    : { top: "calc(144px + env(safe-area-inset-top))", left: 12, right: 12 };
}

/** Rows a phone toast shows before a tap expands it (every floor line fits at 375 px, EN and ID). */
export const TOAST_ROWS = 4;

/** Docked on a phone (owner decision 2026-10-25): the box sits at the bottom in thumb reach, full width. */
export const DOCK_PLACE = "bottom-[calc(12px+env(safe-area-inset-bottom))] left-3 right-3";

/**
 * A phone line that asks for a choice (its own choices, or a try-it's Continue) docks at the bottom while it shows,
 * and the bottom band (joystick, Boost, Reset view) steps aside. Lines without choices stay the top toast.
 */
export function docks(view: Pick<DialogView, "line" | "paused" | "fallback">): boolean {
  return !view.paused && Boolean(view.line?.choices?.length || view.fallback);
}
