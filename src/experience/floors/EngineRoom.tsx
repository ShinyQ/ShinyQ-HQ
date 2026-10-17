"use client";

import { Suspense, useMemo } from "react";
import { useHQStore } from "@/store/useHQStore";
import { FloatingSigns } from "../fx/FloatingSign";
import { RoadMarkings } from "../fx/RoadMarkings";
import type { ExperienceData, GpuTier } from "../types";
import { FlowMesh, PanelMesh } from "./engine/EngineFx";
import { buildEngineLayout, ENGINE } from "./engine/layout";
import { engineScenery, engineSigns, type EngineLabels } from "./engine/scenery";
import { MergedBoxes, MergedEdges } from "./roof/kit";

export type { EngineLabels };

/**
 * B1 Engine Room (spec 2026-10-17): the aisle (road kit), seven bays with their stations, rack rows, pipes and
 * the workbench. Scene draws: the road kit, one merged solid mesh and its edges, two instanced holo draws and
 * the floating sign pair. Stations are point-and-go targets (interact/registry.ts); their drawers are
 * `EngineBody` in this chunk.
 */
export function EngineRoom({ data, labels, tier }: { data: ExperienceData; labels: EngineLabels; tier: GpuTier }) {
  const layout = useMemo(() => buildEngineLayout(), []);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const scene = useMemo(() => engineScenery(layout, tier), [layout, tier]);
  const signs = useMemo(() => engineSigns(layout, data.engine, labels), [layout, data.engine, labels]);
  return (
    <group name="engine-room">
      <RoadMarkings network={layout.network} color={ENGINE.accent} tier={tier} reducedMotion={reducedMotion} />
      <MergedBoxes boxes={scene.solids} color="#0c0a09" emissive={ENGINE.accent} emissiveIntensity={0.06} />
      <MergedEdges boxes={scene.solids} color={ENGINE.accent} tier={tier} opacity={0.7} />
      <FlowMesh items={scene.flows} tier={tier} />
      <PanelMesh items={scene.panels} tier={tier} />
      {/* Text loads fonts asynchronously; keep it from holding back the geometry. */}
      <Suspense fallback={null}>
        <FloatingSigns signs={signs} name="engine-signs" tier={tier} />
      </Suspense>
    </group>
  );
}
