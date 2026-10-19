"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { FloorId } from "@/content/schema";
import { useHQStore } from "@/store/useHQStore";
import { COLORS, floorY, SHAFT, towerFloors } from "../config";
import { CareerArchive, type CareerLabels } from "../floors/CareerArchive";
import type { LabsLabels } from "../floors/Labs";
import type { LibraryLabels } from "../floors/Library";
import type { EngineLabels } from "../floors/EngineRoom";
import { Lobby, type LobbyLabels } from "../floors/Lobby";
import type { RoofLabels } from "../floors/Roof";
import { engineFloor, labsFloor, libraryFloor, roofFloor, useFloorChunks } from "../floors/lazyFloors";
import type { ExperienceData, FloorLayout, GpuTier } from "../types";
import { useWarmingFloor } from "../scene/warmState";
import { DrawnWork } from "../scene/DrawnWorkHook";
import { ElevatorShaft } from "./ElevatorShaft";
import { RideCull } from "./RideCullHooks";
import { ReturnPadSign } from "../fx/ReturnPadSign";
import { FloorLevel } from "./FloorLevel";
import { nearFloors } from "./near";
import { slabBox } from "../nav/slab";
import { BoxEdges } from "./primitives";
import { precompileFloor } from "../scene/precompile";
import { beginFloorPrep, endFloorPrep, finishFloorPrep } from "./ridePrep";
import { PREPARE_TIMEOUT } from "./elevator";

export interface TowerLabels {
  lobby: LobbyLabels;
  labs: LabsLabels;
  career: CareerLabels;
  library: LibraryLabels;
  roof: RoofLabels;
  /** B1 Engine Room floor words (`engine`). */
  engine: EngineLabels;
  /** "Back to elevator": the sign over Express Return pads (`hud.interact.returnPad`). */
  returnPad: string;
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

/**
 * Precompiles a floor's shader programs as soon as its content commits (it sits inside the floor's
 * Suspense boundary, after the floor), so the elevator can wait for them with the doors closed instead
 * of compiling mid-dolly (R5 P6). A passive effect on purpose: it runs after the floor's own effects,
 * which still change program variants (`setColorAt` adds instance colors to the L3 pod glass). Before
 * the first frame there is nothing to compile against and the first render compiles anyway, so the
 * floor counts as ready at once.
 */
function FloorPrep({ floor }: { floor: FloorId }) {
  useEffect(() => {
    const token = beginFloorPrep(floor);
    void precompileFloor(floor, { timeoutMs: PREPARE_TIMEOUT * 1000 })
      .catch(() => null)
      .finally(() => finishFloorPrep(floor, token));
    return () => endFloorPrep(floor, token);
  }, [floor]);
  return null;
}

/** Outline around the shaft and every floor's slab box (wings included) except the long L2 corridor, which runs out of the tower on purpose. */
function towerFrame(layouts: Record<FloorId, FloorLayout>) {
  const boxes = (["L1", "L3", "L4", "RF"] as const).map((id) => slabBox(layouts[id]));
  const minX = Math.min(SHAFT.x - SHAFT.size / 2, ...boxes.map((b) => b.minX)) - 2;
  const maxX = Math.max(...boxes.map((b) => b.maxX)) + 2;
  const minZ = Math.min(...boxes.map((b) => b.minZ)) - 2;
  const maxZ = Math.max(...boxes.map((b) => b.maxZ)) + 2;
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
  const warming = useWarmingFloor();
  const b1Unlocked = useHQStore((s) => s.b1Unlocked);
  // B1 (the Engine Room) exists in the tower only once unlocked: locked sessions mount, draw and prefetch nothing of it.
  const floors = towerFloors(b1Unlocked);
  const near = nearFloors(floor, target, exterior, neighbours ? 1 : 0, warming, floors);
  // The floor warmed during boot stays out of the shaft: its doors and indicator would show in the exterior.
  const shaftNear = nearFloors(floor, target, exterior, neighbours ? 1 : 0, null, floors);
  const frame = useMemo(() => towerFrame(layouts), [layouts]);
  // L3, L4, RF and B1 load on demand (floors/floorChunks.ts) and mount once their chunk is here, in an
  // ordinary update like L1 and L2 (`floorMount`); until then the floor's own slab (FloorLevel) shows.
  // Rides hold for the chunk (elevator.ts).
  useFloorChunks(near);
  const Labs = labsFloor();
  const Library = libraryFloor();
  const Roof = roofFloor();
  const EngineRoom = engineFloor();
  /** The floor's component, or null for a lazy floor whose chunk is still loading (the slab shows). */
  const floorContent = (id: FloorId) => {
    switch (id) {
      case "L1":
        return <Lobby data={data} labels={labels.lobby} tier={tier} />;
      case "L2":
        return <CareerArchive career={data.career} labs={layouts.L3.bounds} labels={labels.career} />;
      case "L3":
        return Labs && <Labs data={data} labels={labels.labs} tier={tier} />;
      case "L4":
        return Library && <Library data={data} labels={labels.library} tier={tier} />;
      case "RF":
        return Roof && <Roof data={data} labels={labels.roof} tier={tier} />;
      case "B1":
        return EngineRoom && <EngineRoom data={data} labels={labels.engine} tier={tier} />;
    }
  };

  return (
    <group name="tower">
      {floors.map((id) => {
        const isNear = near.includes(id);
        const content = isNear ? floorContent(id) : null;
        return (
          <FloorLevel key={id} layout={layouts[id]} layouts={layouts} near={isNear}>
            {content && (
              <Suspense fallback={null}>
                {content}
                {layouts[id].returnPad && <ReturnPadSign at={layouts[id].returnPad} label={labels.returnPad} tier={tier} />}
                <FloorPrep floor={id} />
              </Suspense>
            )}
          </FloorLevel>
        );
      })}
      <ElevatorShaft layouts={layouts} near={shaftNear} floors={floors} />
      <DrawnWork />
      <RideCull />
      <BoxEdges size={[frame.w, FRAME_TOP + 1, frame.d]} position={[frame.x, FRAME_TOP / 2 - 0.5, frame.z]} color={COLORS.grid} opacity={0.22} />
    </group>
  );
}
