"use client";

import dynamic from "next/dynamic";
import type { ExperienceData } from "../types";

const FloorsPrototype = dynamic(() => import("./FloorsPrototype"), { ssr: false });

/** Client boundary for the dev-only prototype route (WebGL only, no server render). */
export function PrototypeLoader({ data }: { data: ExperienceData }) {
  return <FloorsPrototype data={data} />;
}
