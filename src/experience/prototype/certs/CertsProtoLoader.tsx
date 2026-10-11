"use client";

import dynamic from "next/dynamic";
import type { ExperienceData } from "../../types";

const CertsProto = dynamic(() => import("./CertsProto"), { ssr: false });

/** Client boundary for the dev-only certification prototype (reads the query on mount). */
export function CertsProtoLoader({ data }: { data: ExperienceData }) {
  return <CertsProto data={data} />;
}
