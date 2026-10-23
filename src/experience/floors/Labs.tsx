"use client";

import { Suspense, useMemo } from "react";
import type { ReactorRingId } from "@/content/tech-rings";
import { useHQStore } from "@/store/useHQStore";
import { RoadMarkings } from "../fx/RoadMarkings";
import type { ExperienceData, GpuTier } from "../types";
import { HologramStage } from "./labs/HologramStage";
import { OpsRoom } from "./labs/OpsRoom";
import { Hub, type HubLabels } from "./labs/Hub";
import { buildLabsLayout, LABS } from "./labs/layout";
import { PacketLanes } from "./labs/PacketLanes";
import { Pods } from "./labs/Pods";
import { Reactor, Waterfalls } from "./labs/ReactorCore";
import { ReactorHighlights } from "./labs/ReactorHighlights";

export type LabsLabels = Pick<HubLabels, "directory" | "open" | "count" | "more"> & {
  /** Tech Reactor ring names (`labs.reactor.rings`). */
  rings: Record<ReactorRingId, string>;
  /** "N projects use X" (`labs.reactor.uses`). */
  uses: (count: number, tech: string) => string;
};

/** L3 Project Roads (walkable floors plan, part 2), generated from the pods in content. */
export function Labs({ data, labels, tier }: { data: ExperienceData; labels: LabsLabels; tier: GpuTier }) {
  const layout = useMemo(() => buildLabsLayout(data.labs.pods), [data.labs.pods]);
  // Stable labels: the wall's BatchedText re-packs whenever its label list changes.
  const hubLabels = useMemo(() => ({ wings: data.labs.wings, directory: labels.directory, open: labels.open, count: labels.count, more: labels.more }), [data.labs.wings, labels]);
  const reactorLabels = useMemo(() => ({ rings: labels.rings, uses: labels.uses }), [labels]);
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
      <Pods placed={layout.placed} shapes={data.labs.shapes} tier={t} />
      <Reactor center={layout.reactor.center} labels={reactorLabels} />
      <ReactorHighlights layout={layout} />
      <Waterfalls bounds={layout.floor.bounds} />
      <OpsRoom ops={layout.ops} data={data.labs.ops} locale={data.locale} />
      <Suspense fallback={null}>
        <HologramStage placed={layout.placed} locale={data.locale} tier={t} />
      </Suspense>
    </group>
  );
}
