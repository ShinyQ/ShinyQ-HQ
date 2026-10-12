"use client";

import { Suspense, useMemo } from "react";
import { useHQStore } from "@/store/useHQStore";
import { RoadMarkings } from "../fx/RoadMarkings";
import type { ExperienceData, GpuTier } from "../types";
import { HologramStage } from "./labs/HologramStage";
import { Hub, type HubLabels } from "./labs/Hub";
import { buildLabsLayout, LABS } from "./labs/layout";
import { PacketLanes } from "./labs/PacketLanes";
import { Pods } from "./labs/Pods";

export type LabsLabels = Pick<HubLabels, "directory" | "open" | "count">;

/** L3 Project Roads (walkable floors plan, part 2), generated from the pods in content. */
export function Labs({ data, labels, tier }: { data: ExperienceData; labels: LabsLabels; tier: GpuTier }) {
  const layout = useMemo(() => buildLabsLayout(data.labs.pods), [data.labs.pods]);
  // Stable labels: the wall's BatchedText re-packs whenever its label list changes.
  const hubLabels = useMemo(() => ({ wings: data.labs.wings, directory: labels.directory, open: labels.open, count: labels.count }), [data.labs.wings, labels]);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const t = tier === "full" ? "full" : "lite";
  return (
    <group name="labs">
      <RoadMarkings network={layout.network} color={LABS.accent} tier={tier} reducedMotion={reducedMotion} chevronSpacing={5} />
      {/* Text loads fonts asynchronously; keep it from holding back the geometry. */}
      <Suspense fallback={null}>
        <Hub layout={layout} pods={data.labs.pods} labels={hubLabels} />
      </Suspense>
      <PacketLanes lanes={layout.lanes} packets={t === "full" ? 36 : 16} />
      <Pods placed={layout.placed} tier={t} />
      <Suspense fallback={null}>
        <HologramStage placed={layout.placed} locale={data.locale} tier={t} />
      </Suspense>
    </group>
  );
}
