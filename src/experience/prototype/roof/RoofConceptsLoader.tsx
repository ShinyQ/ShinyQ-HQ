"use client";

import dynamic from "next/dynamic";
import type { ExperienceData } from "../../types";

const RoofConcepts = dynamic(() => import("./RoofConcepts"), { ssr: false });

/** Client boundary for the dev-only RF concepts route (WebGL only, no server render). */
export function RoofConceptsLoader({ data }: { data: ExperienceData }) {
  return <RoofConcepts data={data} />;
}
