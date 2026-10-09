"use client";

import { lazy, Suspense, useMemo, type RefObject } from "react";
import "../text-config";
import { CameraDirector } from "../camera/CameraDirector";
import { buildFloorLayouts, COLORS } from "../config";
import { Rover } from "../rover/Rover";
import { Tower, type TowerLabels } from "../tower/Tower";
import type { ExperienceData, GpuTier } from "../types";
import { Director } from "./Director";

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
  const layouts = useMemo(() => buildFloorLayouts(data.years.length, { labs: data.labs.pods }), [data.years.length, data.labs.pods]);
  return (
    <>
      <color attach="background" args={[COLORS.void]} />
      <fogExp2 attach="fog" args={[COLORS.void, 0.012]} />
      <hemisphereLight args={["#c7d2fe", COLORS.void, 0.6]} />
      <directionalLight position={[12, 30, 18]} intensity={0.4} />
      <Tower layouts={layouts} data={data} labels={labels} tier={tier} />
      <Rover tier={tier} />
      <Director layouts={layouts} held={held} labels={labels.rover} onToggleLang={onToggleLang} />
      <CameraDirector />
      {tier === "full" && (
        <Suspense fallback={null}>
          <Effects />
        </Suspense>
      )}
    </>
  );
}
