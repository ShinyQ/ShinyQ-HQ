"use client";

import { Suspense, useMemo } from "react";
import { formatCount } from "@/lib/visits/model";
import { useStats } from "@/lib/visits/store";
import { useHQStore } from "@/store/useHQStore";
import { FloatingSigns } from "../fx/FloatingSign";
import { RoadMarkings } from "../fx/RoadMarkings";
import type { ExperienceData, GpuTier } from "../types";
import { FlowMesh, PanelMesh } from "./engine/EngineFx";
import { buildEngineLayout, ENGINE } from "./engine/layout";
import { ReactorCore } from "./engine/ReactorCore";
import { engineScenery, engineSigns, type EngineLabels } from "./engine/scenery";
import { MergedBoxes, MergedEdges } from "./roof/kit";

export type { EngineLabels };

/**
 * B1 Engine Room (spec 2026-10-17): the aisle (road kit), seven bays with their stations, rack rows, pipes and
 * the workbench, and the reactor hall's living core (`ReactorCore`). Scene draws: the road kit, one merged solid mesh
 * and its edges, two instanced holo draws, the core's two and the floating sign pair (with the reactor's title and its
 * counter plate of 30-day visits and questions, rebuilt only when a formatted number changes). Stations are
 * point-and-go targets (interact/registry.ts); their drawers are `EngineBody` in this chunk.
 */
export function EngineRoom({ data, labels, tier }: { data: ExperienceData; labels: EngineLabels; tier: GpuTier }) {
  const layout = useMemo(() => buildEngineLayout(), []);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const scene = useMemo(() => engineScenery(layout, tier), [layout, tier]);
  const stats = useStats();
  const numbers = stats.status === "ready" ? stats.snapshot : null;
  const visits = numbers ? formatCount(numbers.visits.d30, data.locale) : null;
  const asks = numbers ? formatCount(numbers.asks.d30.total, data.locale) : null;
  const signs = useMemo(() => engineSigns(layout, data.engine, labels, { visits, asks }), [layout, data.engine, labels, visits, asks]);
  return (
    <group name="engine-room">
      <RoadMarkings network={layout.network} color={ENGINE.accent} tier={tier} reducedMotion={reducedMotion} />
      <MergedBoxes boxes={scene.solids} color="#0c0a09" emissive={ENGINE.accent} emissiveIntensity={0.06} />
      <MergedEdges boxes={scene.solids} color={ENGINE.accent} tier={tier} opacity={0.7} />
      <FlowMesh items={scene.flows} tier={tier} />
      <PanelMesh items={scene.panels} tier={tier} />
      <ReactorCore tier={tier} stats={stats} />
      {/* Text loads fonts asynchronously; keep it from holding back the geometry. */}
      <Suspense fallback={null}>
        <FloatingSigns signs={signs} name="engine-signs" tier={tier} />
      </Suspense>
    </group>
  );
}
