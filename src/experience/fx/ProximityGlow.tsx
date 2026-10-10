"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CircleGeometry, Color, Float32BufferAttribute, Object3D, RingGeometry, type InstancedMesh } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useHQStore } from "@/store/useHQStore";
import { DOOR_SIZE, padHalf } from "../nav/doors";
import { roverRuntime } from "../rover/runtime";
import type { DoorTrigger } from "../types";
import { neonColor } from "./materials";
import { proximityLevel } from "./proximity";

/** Pad geometry: a dim fill disc plus a bright rim ring, merged with per-vertex brightness. */
function padGeometry() {
  // Same footprint as the trigger (DOOR_SIZE), so the glowing pad is exactly where a room opens.
  const r = DOOR_SIZE / 2;
  const fill = new CircleGeometry(r * 0.85, 40);
  const ring = new RingGeometry(r * 0.85, r, 40);
  const shade = (g: CircleGeometry | RingGeometry, k: number) => g.setAttribute("color", new Float32BufferAttribute(new Array(g.getAttribute("position").count * 3).fill(k), 3));
  shade(fill, 0.3);
  shade(ring, 1);
  const merged = mergeGeometries([fill, ring], false)!;
  fill.dispose();
  ring.dispose();
  merged.rotateX(-Math.PI / 2);
  return merged;
}

/**
 * Door pads that brighten as the rover gets close (one instanced, additive draw call per floor).
 * The level lives in the instance color, since additive blending makes brightness act as opacity.
 */
export function ProximityGlow({ doors, color, floorY }: { doors: DoorTrigger[]; color: string; floorY: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const tier = useHQStore((s) => s.tier);
  const geometry = useMemo(() => padGeometry(), []);
  const base = useMemo(() => neonColor(color, 1.6, tier), [color, tier]);
  const levels = useRef<number[]>([]);
  const tmp = useMemo(() => new Color(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const d = new Object3D();
    doors.forEach((door, i) => {
      // Same footprint as the trigger: DOOR_SIZE deep along the door's facing, its width across.
      const { along, across } = padHalf(door);
      d.position.set(door.at.x, 0.025, door.at.z);
      d.rotation.set(0, door.facing ? Math.atan2(door.facing.x, door.facing.z) : 0, 0);
      d.scale.set(across / along, 1, 1);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, tmp.copy(base).multiplyScalar(0.15));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    levels.current = doors.map(() => 0.15);
  }, [doors, base, tmp]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const here = Math.abs(roverRuntime.y - floorY) < 0.5;
    let dirty = false;
    doors.forEach((door, i) => {
      const want = here ? proximityLevel(Math.hypot(roverRuntime.x - door.at.x, roverRuntime.z - door.at.z)) : 0.15;
      const cur = levels.current[i] ?? 0.15;
      const next = cur + (want - cur) * Math.min(1, dt * 8);
      if (Math.abs(next - cur) > 1e-3) {
        levels.current[i] = next;
        m.setColorAt(i, tmp.copy(base).multiplyScalar(next));
        dirty = true;
      }
    });
    if (dirty && m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  if (doors.length === 0) return null;
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, doors.length]} raycast={() => null} frustumCulled={false}>
      <meshBasicMaterial vertexColors transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}
