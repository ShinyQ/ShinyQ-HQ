"use client";

import { lazy, memo, Suspense, useMemo, type RefObject } from "react";
import { useHQStore } from "@/store/useHQStore";
import "../text-config";
import { CameraDirector } from "../camera/CameraDirector";
import { buildFloorLayouts, floorY } from "../config";
import { allGlassMaterials } from "../fx/geometry";
import { Motes } from "../fx/Motes";
import { TeleportBeam } from "../fx/TeleportBeam";
import { useUniformTime } from "../fx/useUniformTime";
import { careerLayoutInput } from "../floors/career/layout";
import { libraryLayoutInput } from "../floors/library/model";
import { Rover } from "../rover/Rover";
import { Tower, type TowerLabels } from "../tower/Tower";
import { HintProbe } from "../hints/HintProbe";
import { InteractLayer } from "../interact/InteractLayer";
import type { InteractLabels } from "../interact/registry";
import type { ExperienceData, GpuTier } from "../types";
import { Director } from "./Director";
import { ProgramWarmup } from "./ProgramWarmup";
import { QualityController } from "./QualityController";
import { sceneSettings, type GfxOverride, type RenderBudget } from "./settings";
import { SkyController } from "../sky/SkyController";
import { RenderCounter } from "../perf/RenderCounter";

// Postprocessing is only downloaded on the full tier.
const Effects = lazy(() => import("./Effects"));
// `?gfx=probe` only: the black-frame probe (debugging on a visitor's device).
const BlackFrameProbe = lazy(() => import("./BlackFrameProbe"));

/** Advances the shared glass shader clock once per frame. */
function GlassClock() {
  useUniformTime(allGlassMaterials);
  return null;
}

/** Ambient motes over the current floor (full tier, not under reduced motion). */
function FloorMotes() {
  const floor = useHQStore((s) => s.floor);
  const reduced = useHQStore((s) => s.reducedMotion);
  if (reduced) return null;
  return <Motes center={[0, floorY(floor), 0]} />;
}

export interface SceneLabels extends TowerLabels {
  rover: { hello: string };
  /** Point-and-go labels for targets without a content title. */
  interact: InteractLabels;
}

export const Scene = memo(function Scene({
  data,
  tier,
  labels,
  held,
  onToggleLang,
  budget,
  gfx,
}: {
  data: ExperienceData;
  tier: GpuTier;
  labels: SceneLabels;
  held: RefObject<Set<string>>;
  onToggleLang: () => void;
  budget: RenderBudget;
  gfx: GfxOverride;
}) {
  const layouts = useMemo(
    () => buildFloorLayouts(data.years.length, { labs: data.labs.pods, career: careerLayoutInput(data.career), library: libraryLayoutInput(data.library) }),
    [data.years.length, data.labs.pods, data.career, data.library],
  );
  const interactData = useMemo(() => ({ experience: data, labels: labels.interact }), [data, labels.interact]);
  const settings = sceneSettings(tier);
  const coarse = useHQStore((s) => s.device.coarse);
  return (
    <>
      <RenderCounter />
      <color attach="background" args={[settings.fog.color]} />
      <fog attach="fog" args={[settings.fog.color, settings.fog.near, settings.fog.far]} />
      <SkyController tier={tier} />
      <Tower layouts={layouts} data={data} labels={labels} tier={tier} />
      <InteractLayer layouts={layouts} data={interactData} tier={tier} />
      <HintProbe />
      <Rover tier={tier} />
      <TeleportBeam />
      <Director layouts={layouts} held={held} labels={labels.rover} onToggleLang={onToggleLang} />
      <CameraDirector held={held} railAxis={layouts.L2.road?.roads[0]?.points} layouts={layouts} />
      <GlassClock />
      <QualityController tier={tier} coarse={coarse} gfx={gfx} />
      <ProgramWarmup tier={tier} />
      {tier === "full" && <FloorMotes />}
      {tier === "full" && (
        <Suspense fallback={null}>
          <Effects multisampling={budget.multisampling} levels={budget.bloomLevels} />
        </Suspense>
      )}
      {gfx.probe && (
        <Suspense fallback={null}>
          <BlackFrameProbe />
        </Suspense>
      )}
    </>
  );
});
