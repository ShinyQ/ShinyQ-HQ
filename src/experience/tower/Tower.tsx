"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { FloorId } from "@/content/schema";
import { useHQStore } from "@/store/useHQStore";
import { COLORS, FLOOR_IDS, floorY, SHAFT } from "../config";
import { CareerArchive, type CareerLabels } from "../floors/CareerArchive";
import { Labs, type LabsLabels } from "../floors/Labs";
import { Library, type LibraryLabels } from "../floors/Library";
import { Lobby, type LobbyLabels } from "../floors/Lobby";
import { Roof, type RoofLabels } from "../floors/Roof";
import type { ExperienceData, FloorLayout, GpuTier } from "../types";
import { ElevatorShaft } from "./ElevatorShaft";
import { FloorLevel } from "./FloorLevel";
import { nearFloors } from "./near";
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

/** Neighbouring floors mount once the page is idle after the first frames (at most 1.5 s). */
function useNeighboursReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(() => setReady(true), 300);
    return () => window.clearTimeout(timer);
  }, []);
  return ready;
}

/** Outline around the shaft and every floor except the long L2 corridor, which runs out of the tower on purpose. */
function towerFrame(layouts: Record<FloorId, FloorLayout>) {
  const ids: FloorId[] = ["L1", "L3", "L4", "RF"];
  const minX = Math.min(SHAFT.x - SHAFT.size / 2, ...ids.map((id) => layouts[id].bounds.minX)) - 2;
  const maxX = Math.max(...ids.map((id) => layouts[id].bounds.maxX)) + 2;
  const minZ = Math.min(...ids.map((id) => layouts[id].bounds.minZ)) - 2;
  const maxZ = Math.max(...ids.map((id) => layouts[id].bounds.maxZ)) + 2;
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ };
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
  const neighbours = useNeighboursReady();
  const near = nearFloors(floor, target, exterior, neighbours ? 1 : 0);
  const frame = useMemo(() => towerFrame(layouts), [layouts]);

  return (
    <group name="tower">
      {FLOOR_IDS.map((id) => {
        const isNear = near.includes(id);
        return (
          <FloorLevel key={id} layout={layouts[id]} near={isNear}>
            {isNear && (
              <Suspense fallback={null}>
                {id === "L1" ? (
                  <Lobby data={data} labels={labels.lobby} tier={tier} />
                ) : id === "L3" ? (
                  <Labs data={data} labels={labels.labs} tier={tier} />
                ) : id === "L2" ? (
                  <CareerArchive career={data.career} labs={layouts.L3.bounds} labels={labels.career} />
                ) : id === "L4" ? (
                  <Library data={data} labels={labels.library} tier={tier} />
                ) : (
                  <Roof data={data} labels={labels.roof} tier={tier} />
                )}
              </Suspense>
            )}
          </FloorLevel>
        );
      })}
      <ElevatorShaft layouts={layouts} near={near} />
      <BoxEdges size={[frame.w, FRAME_TOP + 1, frame.d]} position={[frame.x, FRAME_TOP / 2 - 0.5, frame.z]} color={COLORS.grid} opacity={0.22} />
    </group>
  );
}
