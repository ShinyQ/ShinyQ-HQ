"use client";

import { Suspense, useMemo } from "react";
import type { ExperienceData, GpuTier } from "../types";
import { Atrium, type AtriumLabels } from "./labs/Atrium";
import { HologramStage } from "./labs/HologramStage";
import { buildLabsLayout } from "./labs/layout";
import { PacketLanes } from "./labs/PacketLanes";
import { Pods } from "./labs/Pods";

export type LabsLabels = Pick<AtriumLabels, "directory">;

/** L3 Labs (appendix 01 section 4, Phase 4 layout), generated from the pods in content. */
export function Labs({ data, labels, tier }: { data: ExperienceData; labels: LabsLabels; tier: GpuTier }) {
  const layout = useMemo(() => buildLabsLayout(data.labs.pods), [data.labs.pods]);
  const t = tier === "full" ? "full" : "lite";
  return (
    <group name="labs">
      {/* Text loads fonts asynchronously; keep it from holding back the geometry. */}
      <Suspense fallback={null}>
        <Atrium layout={layout} pods={data.labs.pods} labels={{ wings: data.labs.wings, directory: labels.directory }} />
      </Suspense>
      <PacketLanes lanes={layout.lanes} packets={t === "full" ? 36 : 16} />
      <Pods placed={layout.placed} tier={t} />
      <Suspense fallback={null}>
        <HologramStage placed={layout.placed} locale={data.locale} tier={t} />
      </Suspense>
    </group>
  );
}
