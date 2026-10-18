import { runMissionSteps } from "@/experience/missions/bridge";
import type { HudAction } from "../hudActions";

/** Search terms in both languages (the label is in the visitor's locale only). */
const KEYWORDS = ["b1", "engine room", "engine", "basement", "secret floor", "how this site was built", "built", "ruang mesin", "lantai rahasia", "cara situs ini dibuat"];

/** Cmd-K "Go to B1 Engine Room": rides there like a floor button (registered only in 3D, once B1 is unlocked). */
export function engineRoomAction(label: string): HudAction {
  return { id: "engine-room", label, keywords: KEYWORDS, run: () => void runMissionSteps("engine-room", [{ kind: "elevator", floor: "B1" }]) };
}
