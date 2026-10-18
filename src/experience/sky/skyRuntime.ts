import type { SkyMode } from "./dayNight";

/** Live sky state, written once per frame by SkyController (probes, the RF star dome). */
export const skyRuntime = {
  phase: 0,
  day: 0,
  stars: 1,
  source: "held" as SkyMode["source"],
  /** The automation hold: the dome shows no stars and the sun and moon are invisible (`stars` still reports the model). */
  still: false,
  /** Hex of the fog (and background) color as last applied; the night value until the first application. */
  fog: 0x0a0a0f,
  /** The rover is below the Lobby (B1): the sky group is hidden and the night state holds (test probe). */
  underground: false,
  /** How many times the sky was applied (0 until the controller ran). */
  applied: 0,
};
