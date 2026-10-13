"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Matrix4, Quaternion, Vector3, type Group, type InstancedMesh, type PerspectiveCamera } from "three";
import type { Text } from "troika-three-text";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { BatchedLabels, type BatchedLabelsHandle } from "../../fx/BatchedLabels";
import { countUp } from "../../fx/countUp";
import type { BatchedLabel } from "../../fx/labelProps";
import { neonColor } from "../../fx/materials";
import { roverRuntime } from "../../rover/runtime";
import { COLORS, LOBBY } from "../../config";
import type { ExperienceData } from "../../types";
import { FONTS } from "../../tower/primitives";
import { backToFront, composeTile, DOT_OFFSET, DOT_RADIUS, LABEL_OFFSET, RING_BOUNDS, TILE_H, TILE_W, TILE_Y, tileBase, VALUE_OFFSET, writeEdges } from "./statsRingLayout";

const ACCENTS = [COLORS.green, COLORS.cyan, COLORS.violet, COLORS.amber, COLORS.pink, "#60a5fa"];
const COUNT_SECONDS = 0.9;
/** Each count-up step retypesets the values; 30 Hz reads the same as every frame and costs half. */
const COUNT_INTERVAL = 1 / 30;
const LIFT = 0.15;
const LIFT_RADIUS = 4;
/** Clock time when the count-up started (once per page load, on the first view of the Lobby). */
let countStart: number | null = null;

function place(text: Text, tile: Matrix4, offset: Matrix4) {
  text.matrixAutoUpdate = false;
  text.matrix.multiplyMatrices(tile, offset);
}

/**
 * Headline stats as floating tiles on a ring around the hologram (appendix 01 section 2). Tiles face
 * the camera, float above the rover and shrink away when they would hide it. Drawn in 5 calls (REPORT
 * F5.2): plates and accent dots are instanced, edges are one line set rewritten per frame, values and
 * labels are two text batches whose members follow the tiles. Plates draw before the hologram
 * (`renderOrder` -3 to -1) and far to near, like the separately sorted tiles did.
 */
export function StatsRing({ stats }: { stats: ExperienceData["stats"] }) {
  const n = stats.length;
  const ring = useRef<Group>(null);
  const plates = useRef<InstancedMesh>(null);
  const glows = useRef<InstancedMesh>(null);
  const values = useRef<BatchedLabelsHandle>(null);
  const labels = useRef<BatchedLabelsHandle>(null);
  const tier = useHQStore((st) => st.tier);
  const frame = useRef({ ys: stats.map((_, i) => tileBase(i, n)[1]), scales: stats.map(() => 1), shown: [] as string[], lastCount: -Infinity, done: false });
  const scratch = useRef({ ringQ: new Quaternion(), camQ: new Quaternion(), facing: new Quaternion(), part: new Matrix4(), tp: new Vector3(), rp: new Vector3(), dist: [] as number[], mats: [] as Matrix4[] });

  const valueLabels = useMemo<BatchedLabel[]>(
    () => stats.map((s, i) => ({ text: countStart === null ? countUp(s.value, 0) : s.value, position: [0, 0, 0], font: FONTS.sansBold, fontSize: 0.62, color: ACCENTS[i % ACCENTS.length], anchorX: "left", anchorY: "middle" })),
    [stats],
  );
  const labelLabels = useMemo<BatchedLabel[]>(
    () => stats.map((s) => ({ text: s.label, position: [0, 0, 0], font: FONTS.sans, fontSize: 0.17, color: "#d4d4d8", anchorX: "left", anchorY: "top", lineHeight: 1.35, maxWidth: TILE_W - 0.4 })),
    [stats],
  );

  const edges = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(n * 72), 3).setUsage(DynamicDrawUsage));
    const colors = new Float32Array(n * 72);
    const c = new Color();
    for (let i = 0; i < n; i++) {
      c.copy(neonColor(ACCENTS[i % ACCENTS.length], 1.4, tier));
      for (let k = 0; k < 24; k++) colors.set([c.r, c.g, c.b], i * 72 + k * 3);
    }
    g.setAttribute("color", new BufferAttribute(colors, 3));
    // Fixed bounds for the whole ring: the vertices move every frame, the ring never leaves this sphere.
    g.boundingSphere = RING_BOUNDS.clone();
    return g;
  }, [n, tier]);
  useEffect(() => () => edges.dispose(), [edges]);

  useLayoutEffect(() => {
    frame.current.shown = valueLabels.map((l) => l.text);
    frame.current.done = false;
  }, [valueLabels]);

  useLayoutEffect(() => {
    for (const mesh of [plates.current, glows.current]) if (mesh) mesh.boundingSphere = RING_BOUNDS.clone();
  }, []);

  useLayoutEffect(() => {
    const g = glows.current;
    if (!g) return;
    for (let i = 0; i < n; i++) g.setColorAt(i, neonColor(ACCENTS[i % ACCENTS.length], 2, tier));
    if (g.instanceColor) g.instanceColor.needsUpdate = true;
  }, [n, tier]);

  useFrame((state, rawDt) => {
    const r = ring.current;
    const p = plates.current;
    const g = glows.current;
    if (!r || !p || !g) return;
    const dt = Math.min(rawDt, 0.1);
    const s = getHQStore().getState();
    const reduced = s.reducedMotion;
    if (!reduced) {
      r.rotation.y += dt * 0.06;
      r.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.15;
    }
    r.updateWorldMatrix(true, false);

    // Billboard: every tile turns to the camera (drei Billboard: inverse ring rotation times camera rotation).
    const camera = state.camera as PerspectiveCamera;
    const { ringQ, camQ, facing, part, tp, rp, dist, mats } = scratch.current;
    while (mats.length < n) mats.push(new Matrix4());
    dist.length = n;
    r.getWorldQuaternion(ringQ);
    camera.getWorldQuaternion(camQ);
    facing.copy(ringQ).invert().multiply(camQ);

    // A tile between the camera and the rover on screen shrinks away, so the rover is never hidden.
    rp.set(roverRuntime.x, roverRuntime.y + 1.4, roverRuntime.z);
    const roverDistance = rp.distanceTo(camera.position);
    rp.project(camera);
    const tanHalf = Math.tan(((camera.fov / 2) * Math.PI) / 180);
    const k = reduced ? 1 : 1 - Math.exp(-dt * 12);
    const f = frame.current;
    for (let i = 0; i < n; i++) {
      const [bx, by, bz] = tileBase(i, n);
      tp.set(bx, f.ys[i], bz).applyMatrix4(r.matrixWorld);
      // Tiles lift a little when the rover drives under them.
      const near = Math.hypot(tp.x - roverRuntime.x, tp.z - roverRuntime.z) < LIFT_RADIUS && Math.abs(tp.y - TILE_Y - roverRuntime.y) < 3;
      f.ys[i] += (by + (near ? LIFT : 0) - f.ys[i]) * k;
      const distance = tp.distanceTo(camera.position);
      dist[i] = distance;
      tp.project(camera);
      // Tile half-size plus the rover's half-size (about 1 u wide, 1.6 u tall), in screen units.
      const halfY = (TILE_H / 2 + 1.6) / (distance * tanHalf);
      const halfX = (TILE_W / 2 + 1.0) / (distance * tanHalf * camera.aspect);
      const covers = distance < roverDistance && Math.abs(tp.x - rp.x) < halfX && Math.abs(tp.y - rp.y) < halfY;
      f.scales[i] += ((covers ? 0.001 : 1) - f.scales[i]) * k;
      composeTile(mats[i], bx, f.ys[i], bz, facing, f.scales[i]);
    }

    backToFront(dist).forEach((i, slot) => p.setMatrixAt(slot, mats[i]));
    p.instanceMatrix.needsUpdate = true;
    const positions = edges.getAttribute("position") as BufferAttribute;
    for (let i = 0; i < n; i++) {
      g.setMatrixAt(i, part.multiplyMatrices(mats[i], DOT_OFFSET));
      writeEdges(positions.array as Float32Array, i, mats[i]);
    }
    g.instanceMatrix.needsUpdate = true;
    positions.needsUpdate = true;

    const vm = values.current?.members;
    const lm = labels.current?.members;
    if (vm?.length === n && lm?.length === n) {
      for (let i = 0; i < n; i++) {
        place(vm[i], mats[i], VALUE_OFFSET);
        place(lm[i], mats[i], LABEL_OFFSET);
      }
    }

    // Count up from zero the first time the Lobby is explored (instant under reduced motion).
    if (countStart === null && s.floor === "L1" && s.phase === "explore") countStart = state.clock.elapsedTime;
    if (countStart === null || f.done || vm?.length !== n) return;
    const t = state.clock.elapsedTime;
    const progress = reduced ? 1 : Math.min(1, (t - countStart) / COUNT_SECONDS);
    if (progress < 1 && t - f.lastCount < COUNT_INTERVAL) return;
    f.lastCount = t;
    const eased = 1 - Math.pow(1 - progress, 3);
    stats.forEach((stat, i) => {
      const next = countUp(stat.value, eased);
      if (next === f.shown[i]) return;
      f.shown[i] = next;
      vm[i].text = next;
      vm[i].sync();
    });
    if (progress >= 1) f.done = true;
  });

  return (
    <group position={[LOBBY.hologram.x, 0, LOBBY.hologram.z]} name="stats-ring">
      <group ref={ring}>
        <instancedMesh ref={plates} args={[undefined, undefined, n]} renderOrder={-3}>
          <planeGeometry args={[TILE_W, TILE_H]} />
          <meshBasicMaterial color="#0f0f19" transparent opacity={0.86} />
        </instancedMesh>
        <lineSegments geometry={edges} renderOrder={-2}>
          <lineBasicMaterial vertexColors transparent opacity={0.9} toneMapped={false} />
        </lineSegments>
        {/* Glowing accent dot beside each value (R5 P10: never a colored top edge). */}
        <instancedMesh ref={glows} args={[undefined, undefined, n]}>
          <circleGeometry args={[DOT_RADIUS, 20]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
        <BatchedLabels ref={values} labels={valueLabels} name="stats-values" renderOrder={-1} exactColors />
        <BatchedLabels ref={labels} labels={labelLabels} name="stats-labels" renderOrder={-1} toneMapped exactColors />
      </group>
    </group>
  );
}
