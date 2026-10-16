import type { FloorId } from "@/content/schema";
import type { DialogLine } from "./engine";

/** Floors whose first visit gets one Rover line about the floor. L1 is introduced by the onboarding. */
export const FLOOR_LINES: readonly FloorId[] = ["L2", "L3", "L4", "RF"];

/** First visit to a floor: one line about it (`dialog.floor.<id>`); the A button or Enter continues. */
export function floorIntroLine(text: string): DialogLine {
  return { key: "floor", text, face: "arrived" };
}
