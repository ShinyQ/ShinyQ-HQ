import type { ComponentType } from "react";
import type { LibraryConcept } from "../model";
import { AtriumDecor } from "./AtriumDecor";
import type { DecorProps } from "./common";
import { ConstellationDecor } from "./ConstellationDecor";
import { NewsroomDecor } from "./NewsroomDecor";

export type { DecorProps } from "./common";

/** Decor per L4 concept; every concept reads the same `LibraryLayout`. */
export const CONCEPT_DECOR: Record<LibraryConcept, ComponentType<DecorProps>> = {
  atrium: AtriumDecor,
  newsroom: NewsroomDecor,
  constellation: ConstellationDecor,
};
