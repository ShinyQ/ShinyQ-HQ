"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Object3D, type InstancedMesh } from "three";
import { useHQStore } from "@/store/useHQStore";
import { COLORS, LOBBY } from "../../config";
import { FloorLine } from "../../tower/primitives";

type P = [number, number];

const PACKET_SPEED = 2;
const { x: HX, z: HZ } = LOBBY.hologram;

/** Lane polylines: a ring around the hologram and spokes to the kiosk, both walls and the elevator. */
function buildLanes(): P[][] {
  const ring: P[] = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2;
    return [HX + Math.cos(a) * LOBBY.laneRadius, HZ + Math.sin(a) * LOBBY.laneRadius];
  });
  // Spurs leave the ring outward, so nothing crosses the plaza under the stats tiles.
  const spoke = (to: P): P[] => {
    const dx = to[0] - HX;
    const dz = to[1] - HZ;
    const len = Math.hypot(dx, dz);
    return [[HX + (dx / len) * LOBBY.laneRadius, HZ + (dz / len) * LOBBY.laneRadius], to];
  };
  return [
    ring,
    spoke([LOBBY.kiosk.x + 1.2, LOBBY.kiosk.z - 1.2]),
    spoke([LOBBY.skillsWall.x, LOBBY.skillsWall.z + 1.2]),
    spoke([LOBBY.certWall.x - 1.4, LOBBY.certWall.z]),
    spoke([-21, 0]),
  ];
}

function sample(path: P[], lengths: number[], total: number, s: number): P {
  let d = ((s % total) + total) % total;
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i]) {
      const t = lengths[i] ? d / lengths[i] : 0;
      const a = path[i];
      const b = path[i + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    d -= lengths[i];
  }
  return path[path.length - 1];
}

/** Floor lanes with data packets moving at 2 u/s (no packets under reduced motion). */
export function Lanes({ packets }: { packets: number }) {
  const reduced = useHQStore((s) => s.reducedMotion);
  const lanes = useMemo(() => buildLanes(), []);
  const measured = useMemo(
    () =>
      lanes.map((path) => {
        const lengths = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
        return { path, lengths, total: lengths.reduce((a, b) => a + b, 0) };
      }),
    [lanes],
  );
  const seeds = useMemo(
    () => Array.from({ length: packets }, (_, i) => ({ lane: i % measured.length, offset: (i * 7.31) % 60, dir: i % 3 === 0 ? -1 : 1 })),
    [packets, measured.length],
  );
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useRef(new Object3D());

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    seeds.forEach((seed, i) => {
      const lane = measured[seed.lane];
      const [x, z] = sample(lane.path, lane.lengths, lane.total, seed.offset + seed.dir * t * PACKET_SPEED);
      const d = dummy.current;
      d.position.set(x, 0.12, z);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {lanes.map((path, i) => (
        <FloorLine key={i} points={path} color={COLORS.lane} opacity={0.55} />
      ))}
      {!reduced && packets > 0 && (
        <instancedMesh ref={mesh} args={[undefined, undefined, packets]} frustumCulled={false}>
          <boxGeometry args={[0.22, 0.22, 0.22]} />
          <meshBasicMaterial color={COLORS.packet} toneMapped={false} />
        </instancedMesh>
      )}
    </group>
  );
}
