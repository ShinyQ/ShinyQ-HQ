/**
 * The intro chunk entry: the code only the boot and the intro run (the camera timeline, the floor beacons and
 * the veil). It loads on demand for a session that plays the intro (`./chunk.ts`); a returning session never
 * downloads it. Main-path code reads it through `introModule()` and imports nothing from here but types.
 */
export { INTRO, introFace, introFog, introHeading, introPlan, introPose, reducedVeil, revealRadius, skipsIntro, type IntroPlan } from "../camera/intro";
export { IntroBeacons } from "./IntroBeacons";
export { IntroVeil } from "./IntroVeil";
