import type { Interactable } from "@/experience/hints/source";
import type { DialogLine } from "./engine";

/** Every point-and-go kind has a generic line (`dialog.hints.kind.<kind>`, with the target's `{label}`). */
export const HINT_KINDS = ["door", "elevator-pad", "return-pad", "teleporter", "station", "kiosk", "board"] as const satisfies readonly Interactable["kind"][];

/** Targets with their own line (`dialog.hints.object.<key>`), by exact registry id (r4-i ids; r4-g for the hall). */
export const HINT_OBJECTS: Readonly<Record<string, string>> = {
  "L1:station:highlights-about": "highlights",
  "L1:kiosk:ask-rover": "roverMenu",
  "RF:station:cv": "cv",
  "RF:station:contact": "contact",
  "L4:door:research": "research",
  "L2:station:workshop": "workshop",
  "L2:station:time-console": "timeConsole",
  "L3:door:ops": "ops",
};

export function hintObjectKey(item: Pick<Interactable, "id">): string | null {
  return HINT_OBJECTS[item.id] ?? null;
}

export type HintGoKey = "open" | "pickFloor" | "pickYear" | "toElevator" | "roverMenu" | "browse" | "viewCv" | "go";

/** Label key of the Go choice (`dialog.hints.go.<key>`), named after what point-and-go will do on arrival. */
export function hintGoKey(item: Pick<Interactable, "action">): HintGoKey {
  const action = item.action;
  switch (action.type) {
    case "open-room":
      return "open";
    case "elevator-picker":
      return "pickFloor";
    case "teleport-picker":
    case "console-picker":
      return "pickYear";
    case "return-beam":
      return "toElevator";
    case "command":
      if (action.command === "terminal") return "roverMenu";
      if (action.command === "cv") return "viewCv";
      if (action.command.startsWith("palette:")) return "browse";
      return "go";
  }
}

export interface HintCopy {
  text: string;
  go: string;
  notNow: string;
}

/** The one-line dialog a "!" bubble opens: what the target is, then Go (point-and-go to it) or Not now. */
export function hintLine(item: Pick<Interactable, "kind">, copy: HintCopy): DialogLine {
  return {
    key: `hint:${item.kind}`,
    text: copy.text,
    face: "arrived",
    choices: [
      { id: "go", label: copy.go },
      { id: "no", label: copy.notNow, cancel: true },
    ],
  };
}
