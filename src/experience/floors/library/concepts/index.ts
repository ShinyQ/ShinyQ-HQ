import type { LibraryConcept, LibraryLayout, LibraryLayoutInput } from "../model";
import { buildAtriumLayout } from "./atrium";
import { buildConstellationLayout } from "./constellation";
import { buildNewsroomLayout } from "./newsroom";

/** The three L4 concepts for the owner's pick (dev prototype `/{locale}/dev/library`). */
export const CONCEPT_BUILDERS: Record<LibraryConcept, (input: LibraryLayoutInput) => LibraryLayout> = {
  atrium: buildAtriumLayout,
  newsroom: buildNewsroomLayout,
  constellation: buildConstellationLayout,
};
