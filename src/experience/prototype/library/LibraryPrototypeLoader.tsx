"use client";

import dynamic from "next/dynamic";
import type { ExperienceData } from "../../types";

const LibraryPrototype = dynamic(() => import("./LibraryPrototype"), { ssr: false });

/** Client boundary for the dev-only L4 concepts route (WebGL only, no server render). */
export function LibraryPrototypeLoader({ data }: { data: ExperienceData }) {
  return <LibraryPrototype data={data} />;
}
