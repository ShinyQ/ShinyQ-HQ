import type { ViewportClass } from "@/experience/types";

export type DialogPlacement = "bottom" | "raised" | "phone";

/**
 * Where the box sits, always above the HUD bottom band's center column (point-and-go's one-time
 * "Click a glowing object" hint or its "Go to {label}" chip in InteractStatus, then the controls
 * hint, which hides while Rover speaks): 128 px on fine pointers (pill 44 + hint 40 + gaps and
 * padding), above the joystick and boost on touch tablets, and on phones above the stacked boost
 * button and joystick and left of the elevator panel (right edge, vertically centered; 68 px clears its 54 px column, the 8 px edge gap and the frame ring).
 */
export function dialogPlacement(viewport: ViewportClass, coarse: boolean): DialogPlacement {
  if (!coarse) return "bottom";
  return viewport === "mobile" ? "phone" : "raised";
}

export const DIALOG_PLACE: Record<DialogPlacement, string> = {
  bottom: "bottom-[128px] left-1/2 w-[min(640px,calc(100%-2rem))] -translate-x-1/2",
  raised: "bottom-[160px] left-1/2 w-[min(560px,calc(100%-2rem))] -translate-x-1/2",
  phone: "bottom-[calc(232px+env(safe-area-inset-bottom))] left-3 right-[68px]",
};
