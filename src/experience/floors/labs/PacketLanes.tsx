"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Object3D, type InstancedMesh } from "three";
import { useHQStore } from "@/store/useHQStore";
import { COLORS } from "../../config";
import { LineBatch } from "./lines";

type P = [number, number];
const PACKET_SPEED = 2;

function measure(path: P[]) {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  return { path, lengths, total: lengths.reduce((a, b) => a + b, 0) || 1 };
}

function sample({ path, lengths, total }: ReturnType<typeof measure>, s: number): P {
  let d = ((s % total) + total) % total;
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i]) {
      const t = lengths[i] ? d / lengths[i] : 0;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t];
    }
    d -= lengths[i];
  }
  return path[path.length - 1];
}

/** Floor lanes (one draw call) with data packets at 2 u/s (no packets under reduced motion). */
export function PacketLanes({ lanes, packets }: { lanes: P[][]; packets: number }) {
  const reduced = useHQStore((s) => s.reducedMotion);
  const geometry = useMemo(() => {
    const batch = new LineBatch();
    for (const lane of lanes) batch.path(lane, 0.03, COLORS.lane);
    return batch.build();
  }, [lanes]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const measured = useMemo(() => lanes.map(measure), [lanes]);
  const seeds = useMemo(() => {
    // Longer lanes get more packets.
    const weights = measured.map((m) => m.total);
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const out: { lane: number; offset: number; dir: number }[] = [];
    measured.forEach((m, lane) => {
      const n = Math.max(lane < 7 ? 1 : 0, Math.round((weights[lane] / sum) * packets));
      for (let i = 0; i < n; i++) out.push({ lane, offset: (i / n) * m.total + lane * 1.7, dir: (lane + i) % 3 === 0 ? -1 : 1 });
    });
    return out.slice(0, packets);
  }, [measured, packets]);
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    seeds.forEach((seed, i) => {
      const [x, z] = sample(measured[seed.lane], seed.offset + seed.dir * t * PACKET_SPEED);
      dummy.position.set(x, 0.12, z);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial vertexColors transparent opacity={0.55} toneMapped={false} />
      </lineSegments>
      {!reduced && seeds.length > 0 && (
        <instancedMesh ref={mesh} args={[undefined, undefined, seeds.length]} frustumCulled={false}>
          <boxGeometry args={[0.22, 0.22, 0.22]} />
          <meshBasicMaterial color={COLORS.packet} toneMapped={false} />
        </instancedMesh>
      )}
    </group>
  );
}
