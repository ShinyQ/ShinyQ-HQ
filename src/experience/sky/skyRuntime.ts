import type { SkyMode } from "./dayNight";

/** Live sky state, written once per frame by SkyController (probes, the RF star dome). */
export const skyRuntime = { phase: 0, day: 0, stars: 1, source: "held" as SkyMode["source"] };
