/**
 * The Agent Office drawer body chunk (loaded by `./chunk.ts` only when an office drawer opens): kept out of the
 * scene chunk (`./scene.ts`) so the walk-by load stays small. Main-path code imports nothing from here but types.
 */
export { OfficeBody } from "./OfficeBody";
