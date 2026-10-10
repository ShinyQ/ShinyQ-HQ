"use client";

import { lazy, Suspense, useMemo, type RefObject } from "react";
import { useHQStore } from "@/store/useHQStore";
import "../text-config";
import { CameraDirector } from "../camera/CameraDirector";
import { buildFloorLayouts, floorY } from "../config";
import { allGlassMaterials } from "../fx/geometry";
import { Motes } from "../fx/Motes";
import { useUniformTime } from "../fx/useUniformTime";
import { careerLayoutInput } from "../floors/career/layout";
import { Rover } from "../rover/Rover";
import { Tower, type TowerLabels } from "../tower/Tower";
import type { ExperienceData, GpuTier } from "../types";
import { Director } from "./Director";
import { sceneSettings } from "./settings";

// Postprocessing is only downloaded on the full tier.
const Effects = lazy(() => import("./Effects"));

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
}

export function Scene({
  data,
  tier,
  labels,
  held,
  onToggleLang,
}: {
  data: ExperienceData;
  tier: GpuTier;
  labels: SceneLabels;
  held: RefObject<Set<string>>;
  onToggleLang: () => void;
}) {
  const layouts = useMemo(() => buildFloorLayouts(data.years.length, { labs: data.labs.pods, career: careerLayoutInput(data.career) }), [data.years.length, data.labs.pods, data.career]);
  const settings = sceneSettings(tier);
  return (
    <>
      <color attach="background" args={[settings.fog.color]} />
      <fog attach="fog" args={[settings.fog.color, settings.fog.near, settings.fog.far]} />
      <hemisphereLight args={settings.hemisphere} />
      <directionalLight color={settings.directional.color} position={settings.directional.position} intensity={settings.directional.intensity} />
      <Tower layouts={layouts} data={data} labels={labels} tier={tier} />
      <Rover tier={tier} />
      <Director layouts={layouts} held={held} labels={labels.rover} onToggleLang={onToggleLang} />
      <CameraDirector held={held} />
      <GlassClock />
      {tier === "full" && <FloorMotes />}
      {tier === "full" && (
        <Suspense fallback={null}>
          <Effects />
        </Suspense>
      )}
    </>
  );
}
