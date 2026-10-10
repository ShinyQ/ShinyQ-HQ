"use client";

import { lazy, Suspense, useMemo, type RefObject } from "react";
import "../text-config";
import { CameraDirector } from "../camera/CameraDirector";
import { buildFloorLayouts } from "../config";
import { careerLayoutInput } from "../floors/career/layout";
import { Rover } from "../rover/Rover";
import { Tower, type TowerLabels } from "../tower/Tower";
import type { ExperienceData, GpuTier } from "../types";
import { Director } from "./Director";
import { sceneSettings } from "./settings";

// Postprocessing is only downloaded on the full tier.
const Effects = lazy(() => import("./Effects"));

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
      {tier === "full" && (
        <Suspense fallback={null}>
          <Effects />
        </Suspense>
      )}
    </>
  );
}
