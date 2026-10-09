"use client";

import { Suspense } from "react";
import type { FloorId } from "@/content/schema";
import { useHQStore } from "@/store/useHQStore";
import { COLORS, FLOOR_IDS, floorIndex, floorY } from "../config";
import { CareerArchive, type CareerLabels } from "../floors/CareerArchive";
import { Labs, type LabsLabels } from "../floors/Labs";
import { Library, type LibraryLabels } from "../floors/Library";
import { Lobby, type LobbyLabels } from "../floors/Lobby";
import { Roof, type RoofLabels } from "../floors/Roof";
import type { ExperienceData, FloorLayout, GpuTier } from "../types";
import { ElevatorShaft } from "./ElevatorShaft";
import { FloorLevel } from "./FloorLevel";
import type { PlaceholderLabels } from "./PlaceholderFloor";
import { BoxEdges } from "./primitives";

export interface TowerLabels {
  placeholder: PlaceholderLabels;
  lobby: LobbyLabels;
  labs: LabsLabels;
  career: CareerLabels;
  library: LibraryLabels;
  roof: RoofLabels;
}

const FRAME_TOP = floorY("RF") + 10;

/** Floors render full detail only next to the current floor or the ride target; the rest are silhouettes. */
function nearFloors(floor: FloorId, target: FloorId | null, exterior: boolean): FloorId[] {
  return FLOOR_IDS.filter((id) => {
    if (exterior && id === "L1") return true;
    const d = Math.abs(floorIndex(id) - floorIndex(floor));
    const dt = target ? Math.abs(floorIndex(id) - floorIndex(target)) : Infinity;
    return Math.min(d, dt) <= 1;
  });
}

export function Tower({
  layouts,
  data,
  labels,
  tier,
}: {
  layouts: Record<FloorId, FloorLayout>;
  data: ExperienceData;
  labels: TowerLabels;
  tier: GpuTier;
}) {
  const floor = useHQStore((s) => s.floor);
  const target = useHQStore((s) => s.ride?.to ?? null);
  const exterior = useHQStore((s) => s.phase === "boot" || s.phase === "intro");
  const near = nearFloors(floor, target, exterior);

  return (
    <group name="tower">
      {FLOOR_IDS.map((id) => {
        const isNear = near.includes(id);
        return (
          <FloorLevel key={id} layout={layouts[id]} near={isNear} interactive={id === floor}>
            {isNear && (
              <Suspense fallback={null}>
                {id === "L1" ? (
                  <Lobby data={data} labels={labels.lobby} tier={tier} />
                ) : id === "L3" ? (
                  <Labs data={data} labels={labels.labs} tier={tier} />
                ) : id === "L2" ? (
                  <CareerArchive career={data.career} labs={layouts.L3.bounds} labels={labels.career} />
                ) : id === "L4" ? (
                  <Library library={data.library} labels={labels.library} />
                ) : (
                  <Roof roof={data.roof} labels={labels.roof} tier={tier} />
                )}
              </Suspense>
            )}
          </FloorLevel>
        );
      })}
      <ElevatorShaft layouts={layouts} near={near} />
      <BoxEdges size={[108, FRAME_TOP + 1, 48]} position={[0, FRAME_TOP / 2 - 0.5, 0]} color={COLORS.grid} opacity={0.22} />
    </group>
  );
}
