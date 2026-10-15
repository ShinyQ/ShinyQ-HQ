"use client";

import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferGeometry, Color, Float32BufferAttribute, InstancedBufferAttribute, Matrix4, PlaneGeometry, Quaternion, Vector3, type Group, type Mesh } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { BatchedLabels } from "../../fx/BatchedLabels";
import { getGlassMaterial } from "../../fx/geometry";
import { createHoloMaterial, HOLO_MODE } from "../../fx/holoFx";
import type { BatchedLabel } from "../../fx/labelProps";
import { neonColor } from "../../fx/materials";
import { useDispose } from "../../fx/useDispose";
import { COLORS, LOBBY } from "../../config";
import { RIDE_CULL_BOUNDS } from "../../tower/rideCull";
import { FONTS, FloorLine } from "../../tower/primitives";
import { HOLOGRAM } from "./layout";
import { antenna, faceLabels, outlineSegments, ROVER_MARK_3D, screenPlate, treadBoxes } from "./roverMark3d";

const NO_RAYCAST = () => null;
const Y = new Vector3(0, 1, 0);
const M = ROVER_MARK_3D;

const circle = (r: number, n = 48): [number, number][] =>
  Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r]);

/** Globe and plate modes never move a vertex, so the ride cull may hide them under a solid slab. */
function boundsSafe(material: ReturnType<typeof createHoloMaterial>) {
  material.userData[RIDE_CULL_BOUNDS] = true;
  return material;
}

type Part = { at: [number, number, number]; yaw?: number; size: [number, number, number]; color: string };

/** Instance matrices and colors, attached at creation so precompile and culling see the final mesh. */
function instances(parts: readonly Part[]) {
  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  const c = new Color();
  const matrices = new Float32Array(parts.length * 16);
  const colors = new Float32Array(parts.length * 3);
  parts.forEach((part, i) => {
    m.compose(p.set(...part.at), q.setFromAxisAngle(Y, part.yaw ?? 0), s.set(...part.size)).toArray(matrices, i * 16);
    c.set(part.color).toArray(colors, i * 3);
  });
  return { matrices, colors };
}

/**
 * The rover brand mark as a turning hologram on the pedestal (owner pick 2026-10-15; it replaced the KAW
 * monogram), with the name and headline floating above (C5: no photo). Shapes in roverMark3d.ts. Five
 * draw calls on programs the Lobby already has: the head and treads (one instanced holo globe mesh),
 * the screen (a one-instance holo plate mesh), the `^_^` face (one label batch), the neon edges (one
 * line mesh) and the antenna tip (the rover's own tip material).
 */
export function ProfileHologram({ name, headline }: { name: string; headline: string }) {
  const spin = useRef<Group>(null);
  const tip = useRef<Mesh>(null);
  const halos = useRef<(Group | null)[]>([]);
  const flicker = useRef({ until: 0, wasHere: false });
  const tier = useHQStore((st) => st.tier);
  const haloColors = useMemo(() => [neonColor(COLORS.green, 2, tier), neonColor(COLORS.cyan, 2, tier)], [tier]);
  const ring = useMemo(() => circle(3.05), []);
  const { x, z, radius } = LOBBY.hologram;

  const box = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 2, 0.2), []);
  useDispose(box);
  const body = useMemo(
    () => boundsSafe(createHoloMaterial({ mode: HOLO_MODE.globe, color: neonColor("#ffffff", tier === "full" ? 1.4 : 1.1, tier), opacity: tier === "full" ? 0.95 : 0.85 })),
    [tier],
  );
  useDispose(body);
  const bodyData = useMemo(
    () =>
      instances([
        { at: [0, 0, 0], size: [M.head.w, M.head.h, M.head.d], color: M.colors.head },
        ...treadBoxes().map((t) => ({ at: t.at, size: t.size, color: M.colors.tread })),
      ]),
    [],
  );

  const plate = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    g.setAttribute("aAlpha", new InstancedBufferAttribute(new Float32Array([1]), 1));
    return g;
  }, []);
  useDispose(plate);
  const plateMaterial = useMemo(() => boundsSafe(createHoloMaterial({ mode: HOLO_MODE.plate, color: neonColor("#ffffff", 1.5, tier) })), [tier]);
  useDispose(plateMaterial);
  const plateData = useMemo(() => {
    const s = screenPlate();
    return instances([{ at: s.at, size: [s.size[0], s.size[1], 1], color: M.colors.screen }]);
  }, []);

  const faces = useMemo<BatchedLabel[]>(
    () =>
      faceLabels().map((f) => ({
        text: M.face.text,
        position: f.at,
        yaw: f.yaw,
        font: FONTS.monoBold,
        fontSize: M.face.fontSize,
        color: M.colors.eyes,
      })),
    [],
  );

  const edges = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(outlineSegments(), 3));
    return g;
  }, []);
  useDispose(edges);
  const tipAt = useMemo(() => antenna().tip, []);
  const tipColor = useMemo(() => neonColor(M.colors.tip, 3, tier), [tier]);

  useFrame((state, dt) => {
    if (!spin.current) return;
    const reduced = getHQStore().getState().reducedMotion;
    spin.current.rotation.y += Math.min(dt, 0.1) * (reduced ? 0.15 : 0.4);
    spin.current.position.y = HOLOGRAM.y + (reduced ? 0 : Math.sin(state.clock.elapsedTime * 1.2) * 0.12);
    // Counter-rotating halo rings.
    const d = Math.min(dt, 0.1) * (reduced ? 0.25 : 1);
    if (halos.current[0]) halos.current[0].rotation.y += d * 0.4;
    if (halos.current[1]) halos.current[1].rotation.y -= d * 0.25;
    const t = state.clock.elapsedTime;
    // The antenna tip blinks like the rover's.
    if (tip.current) tip.current.scale.setScalar(reduced || Math.sin(t * 5) > 0 ? 1 : 0.55);
    // Flicker in for 400 ms whenever the rover arrives on the Lobby.
    const s = getHQStore().getState();
    const here = s.floor === "L1" && !s.ride && s.phase === "explore";
    const f = flicker.current;
    if (here && !f.wasHere && !reduced) f.until = t + 0.4;
    f.wasHere = here;
    spin.current.visible = t >= f.until || Math.sin(t * 97) + Math.sin(t * 61) > -0.3;
  });

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[radius, radius + 0.2, 0.6, 6]} />
        <meshStandardMaterial color="#0b0b18" roughness={0.8} metalness={0.2} />
      </mesh>
      <group position={[0, 0.62, 0]}>
        <FloorLine points={ring} color={COLORS.green} closed opacity={0.9} />
      </group>
      {/* Projection cone with the glass scanline shimmer. */}
      <mesh position={[0, 2.1, 0]} material={getGlassMaterial(COLORS.green, 0.02)}>
        <cylinderGeometry args={[1.2, 2.6, 3, 6, 1, true]} />
      </mesh>
      {[
        { r: 2.9, tilt: 0.28, y: HOLOGRAM.y - 0.2 },
        { r: 3.3, tilt: -0.2, y: HOLOGRAM.y + 0.3 },
      ].map((h, i) => (
        <group key={i} position={[0, h.y, 0]} rotation={[h.tilt, 0, 0]}>
          <group
            ref={(node) => {
              halos.current[i] = node;
            }}
          >
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[h.r, 0.018, 6, 96, Math.PI * 1.6]} />
              <meshBasicMaterial color={haloColors[i]} transparent opacity={0.85} toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}
      <group ref={spin} position={[0, HOLOGRAM.y, 0]} name="hologram-rover-mark">
        <instancedMesh name="hologram-rover-body" args={[box, body, 3]} raycast={NO_RAYCAST}>
          <instancedBufferAttribute attach="instanceMatrix" args={[bodyData.matrices, 16]} />
          <instancedBufferAttribute attach="instanceColor" args={[bodyData.colors, 3]} />
        </instancedMesh>
        <instancedMesh name="hologram-rover-screens" args={[plate, plateMaterial, 1]} raycast={NO_RAYCAST} renderOrder={1}>
          <instancedBufferAttribute attach="instanceMatrix" args={[plateData.matrices, 16]} />
          <instancedBufferAttribute attach="instanceColor" args={[plateData.colors, 3]} />
        </instancedMesh>
        <BatchedLabels labels={faces} name="hologram-rover-faces" renderOrder={2} />
        <lineSegments geometry={edges} raycast={NO_RAYCAST}>
          <lineBasicMaterial color={M.colors.line} toneMapped={false} />
        </lineSegments>
        <mesh ref={tip} position={tipAt} raycast={NO_RAYCAST}>
          <sphereGeometry args={[M.antenna.tip, 12, 12]} />
          <meshBasicMaterial color={tipColor} toneMapped={false} />
        </mesh>
      </group>
      <Billboard position={[0, LOBBY.titleY, 0]}>
        <Text font={FONTS.sansBold} fontSize={LOBBY.titleFont.name} color="#f4f4f5" anchorX="center" anchorY="bottom" maxWidth={14} textAlign="center">
          {name}
        </Text>
        <Text
          font={FONTS.sans}
          fontSize={LOBBY.titleFont.headline}
          color={COLORS.cyan}
          anchorX="center"
          anchorY="top"
          position={[0, -LOBBY.titleFont.gap, 0]}
          maxWidth={14}
          textAlign="center"
          material-toneMapped={false}
        >
          {headline}
        </Text>
      </Billboard>
    </group>
  );
}
