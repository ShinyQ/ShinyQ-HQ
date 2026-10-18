import { runMissionSteps } from "@/experience/missions/bridge";
import type { HudAction } from "../hudActions";

/** Search terms in both languages (the label is in the visitor's locale only). */
const KEYWORDS = ["b1", "engine room", "engine", "basement", "secret floor", "how this site was built", "built", "ruang mesin", "lantai rahasia", "cara situs ini dibuat"];

/** Rides to B1 like a floor button (callers check the unlock). */
export function rideToEngineRoom(): void {
  void runMissionSteps("engine-room", [{ kind: "elevator", floor: "B1" }]);
}

/** Cmd-K "Go to B1 Engine Room", registered in 3D in both states; `run` defaults to the ride (the layer passes one that says the locked line while B1 is locked). */
export function engineRoomAction(label: string, run: () => void = rideToEngineRoom): HudAction {
  return { id: "engine-room", label, keywords: KEYWORDS, run };
}
