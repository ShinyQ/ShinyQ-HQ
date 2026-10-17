import { hintsOn, setHintsOn, subscribeFlags } from "@/hud/dialog/storage";
import { replayTutorial, subscribeTutorial, tutorialAvailable } from "@/hud/dialog/tutorial";
import { defineSetting } from "../registry";

/** Starts Rover's full tour again (only while the 3D HUD hosts it); the sheet closes first so the tour is visible. */
export const replayTutorialSetting = defineSetting({
  id: "replay-tutorial",
  group: "general",
  order: 30,
  labelKey: "tutorial.label",
  hintKey: "tutorial.hint",
  control: { kind: "action", run: () => void replayTutorial(), closesPanel: true },
  subscribe: subscribeTutorial,
  available: tutorialAvailable,
});

/** The "!" hint bubbles near usable objects (`hq:hints`). */
export const hintsSetting = defineSetting({
  id: "hints",
  group: "general",
  order: 40,
  labelKey: "hints.label",
  hintKey: "hints.hint",
  control: { kind: "toggle", get: () => hintsOn(), set: (on) => setHintsOn(on) },
  subscribe: subscribeFlags,
  available: tutorialAvailable,
});
