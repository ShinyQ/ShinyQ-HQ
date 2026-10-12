import type { FloorId } from "@/content/schema";
import type { DialogLine } from "./engine";

/** Floors whose first visit gets a Rover line ending with the walk choice. L1 is introduced by the onboarding. */
export const FLOOR_LINES: readonly FloorId[] = ["L2", "L3", "L4", "RF"];

export interface FloorIntroCopy {
  /** Rover's line about the floor (`dialog.floor.<id>`). */
  text: string;
  /** The walk's start label (`walk.<id>.start`). */
  start: string;
  /** "Resume at stop N" when an earlier walk can be resumed, else null. */
  resume: string | null;
  explore: string;
}

/** First visit to a floor: one line about it that ends with the walk choice (start or resume, or explore freely). */
export function floorIntroLine(copy: FloorIntroCopy): DialogLine {
  const go = copy.resume ? { id: "resume", label: copy.resume } : { id: "start", label: copy.start };
  return {
    key: "floor",
    text: copy.text,
    face: "arrived",
    choices: [go, { id: "explore", label: copy.explore, cancel: true }],
  };
}
