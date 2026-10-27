import type { ViewportClass } from "@/experience/types";
import type { DialogView } from "./engine";

export type DialogPlacement = "bottom" | "raised" | "phone";

/**
 * Where the box sits, always above the HUD bottom band's center column (point-and-go's one-time
 * "Click a glowing object" hint or its "Go to {label}" chip in InteractStatus, then the controls
 * hint, which hides while Rover speaks): 128 px on fine pointers (pill 44 + hint 40 + gaps and
 * padding), above the joystick and boost on touch tablets, and on phones a slim full-width toast above the
 * joystick (120 px, plus the 24 px band padding and a 24 px gap).
 */
export function dialogPlacement(viewport: ViewportClass, coarse: boolean): DialogPlacement {
  if (!coarse) return "bottom";
  return viewport === "mobile" ? "phone" : "raised";
}

export const DIALOG_PLACE: Record<DialogPlacement, string> = {
  bottom: "bottom-[128px] left-1/2 w-[min(640px,calc(100%-2rem))] -translate-x-1/2",
  raised: "bottom-[160px] left-1/2 w-[min(560px,calc(100%-2rem))] -translate-x-1/2",
  phone: "bottom-[calc(168px+env(safe-area-inset-bottom))] left-3 right-3",
};

/** Docked on a phone (owner decision 2026-10-25): the box sits at the bottom in thumb reach, full width. */
export const DOCK_PLACE = "bottom-[calc(12px+env(safe-area-inset-bottom))] left-3 right-3";

/**
 * A phone line that asks for a choice (its own choices, or a try-it's Continue) docks at the bottom while it shows,
 * and the bottom band (joystick, Boost, Reset view) steps aside. Lines without choices stay the slim toast.
 */
export function docks(view: Pick<DialogView, "line" | "paused" | "fallback">): boolean {
  return !view.paused && Boolean(view.line?.choices?.length || view.fallback);
}
