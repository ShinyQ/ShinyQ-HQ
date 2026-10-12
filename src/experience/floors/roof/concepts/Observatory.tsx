"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, NormalBlending, Object3D, type Group, type InstancedMesh } from "three";
import { BatchedLabels } from "../../../fx/BatchedLabels";
import { HoloIcon } from "../../../fx/HoloIcon";
import { ROOF_ICONS } from "../../../fx/holoIcons";
import type { BatchedLabel } from "../../../fx/labelProps";
import { FONTS } from "../../../tower/primitives";
import type { GpuTier, Vec2 } from "../../../types";
import { aboutCard, HitBox, MergedBoxes, MergedEdges, PulseRings, ROOF_BLUE, ROOF_CYAN, ROOF_VIOLET, type PulseSource, type RoofSceneryProps } from "../kit";
import type { RoofActive } from "../layout";
import { boxBuffers, roofDetail, skylineBoxes, skylineWindows, type Box } from "../solids";

const mid = (a: number, b: number) => (a + b) / 2;

/** Far city silhouettes and their lit windows (two draw calls, no fog so they read on the horizon). */
function Skyline({ tier }: { tier: GpuTier }) {
  const detail = roofDetail(tier);
  const { body, windows } = useMemo(() => {
    const boxes = skylineBoxes(detail.skyline);
    const { positions, normals, indices } = boxBuffers(boxes);
    const body = new BufferGeometry();
    body.setAttribute("position", new BufferAttribute(positions, 3));
    body.setAttribute("normal", new BufferAttribute(normals, 3));
    body.setIndex(new BufferAttribute(indices, 1));
    const windows = new BufferGeometry();
    windows.setAttribute("position", new BufferAttribute(skylineWindows(boxes, detail.windows), 3));
    return { body, windows };
  }, [detail.skyline, detail.windows]);
  useEffect(
    () => () => {
      body.dispose();
      windows.dispose();
    },
    [body, windows],
  );
  return (
    <group name="skyline">
      <mesh geometry={body} raycast={() => null}>
        <meshBasicMaterial color="#0d1236" fog={false} />
      </mesh>
      <points geometry={windows} raycast={() => null}>
        <pointsMaterial color="#fbbf24" size={2} sizeAttenuation={false} transparent opacity={0.75} fog={false} depthWrite={false} toneMapped={false} />
      </points>
    </group>
  );
}

/** Telescope on the central pier: sweeps the sky, swings to the dish while the comms room is open (still under reduced motion). */
function Telescope({ at, tier, reducedMotion, active }: { at: Vec2; tier: GpuTier; reducedMotion: boolean; active: RoofActive }) {
  const yaw = useRef<Group>(null);
  useFrame((state) => {
    const g = yaw.current;
    if (!g) return;
    const sweep = reducedMotion ? 0.6 : 0.6 + Math.sin(state.clock.elapsedTime * 0.12) * 1.1;
    const target = active === "contact" ? Math.PI : sweep;
    g.rotation.y += (target - g.rotation.y) * (reducedMotion ? 1 : 0.04);
  });
  return (
    <group position={[at.x, 2.8, at.z]} name="telescope">
      <group ref={yaw}>
        <group rotation={[-0.55, 0, 0]}>
          <mesh position={[0, 0, 1]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
            <cylinderGeometry args={[0.32, 0.42, 3.2, 16]} />
            <meshStandardMaterial color="#1e293b" emissive={ROOF_BLUE} emissiveIntensity={0.35} roughness={0.5} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0, 16.6]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
            <cylinderGeometry args={[2.4, 0.3, 28, 20, 1, true]} />
            <meshBasicMaterial color={ROOF_BLUE} transparent opacity={tier === "full" ? 0.12 : 0.08} blending={tier === "full" ? AdditiveBlending : NormalBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** The comms dish, opening up toward the plaza; it transmits (faster, wider rings) while the comms room is open. */
function Dish({ at, tier, reducedMotion, active }: { at: Vec2; tier: GpuTier; reducedMotion: boolean; active: RoofActive }) {
  const rings = useMemo<PulseSource[]>(
    () => [
      { x: 0, y: 1.2, z: 0.4, color: ROOF_BLUE, phase: 0 },
      { x: 0, y: 1.2, z: 0.4, color: ROOF_BLUE, phase: 0.5 },
    ],
    [],
  );
  const sending = active === "contact";
  return (
    <group position={[at.x, 2.2, at.z]} name="dish">
      <mesh rotation={[Math.PI + 0.5, 0, 0]} raycast={() => null}>
        <sphereGeometry args={[1.7, 24, 6, 0, Math.PI * 2, 0, Math.PI * 0.32]} />
        <meshStandardMaterial color="#1e293b" emissive={ROOF_BLUE} emissiveIntensity={0.3} side={DoubleSide} roughness={0.6} metalness={0.5} />
      </mesh>
      <PulseRings sources={rings} radius={0.5} grow={sending ? 7 : 3} speed={sending ? 1.2 : 0.35} tier={tier} reducedMotion={reducedMotion} />
    </group>
  );
}

/** One star per contact channel above the comms station, joined in a line (two draw calls). */
function Constellation({ stars, tier }: { stars: readonly { x: number; y: number; z: number }[]; tier: GpuTier }) {
  const mesh = useRef<InstancedMesh>(null);
  const lines = useMemo(() => {
    const pts: number[] = [];
    for (let i = 1; i < stars.length; i++) pts.push(stars[i - 1].x, stars[i - 1].y, stars[i - 1].z, stars[i].x, stars[i].y, stars[i].z);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
    return g;
  }, [stars]);
  useEffect(() => () => lines.dispose(), [lines]);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    stars.forEach((s, i) => {
      o.position.set(s.x, s.y, s.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [stars]);
  if (!stars.length) return null;
  return (
    <group name="constellation">
      <instancedMesh ref={mesh} args={[undefined, undefined, stars.length]} raycast={() => null}>
        <octahedronGeometry args={[0.3, 0]} />
        <meshBasicMaterial color="#dbeafe" toneMapped={false} />
      </instancedMesh>
      <lineSegments geometry={lines} raycast={() => null}>
        <lineBasicMaterial color={ROOF_BLUE} transparent opacity={tier === "full" ? 0.7 : 0.5} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/**
 * Concept A, "Rooftop Observatory": a night deck. A telescope sweeps the sky from the central pier
 * (its plate shows the availability), the comms dish transmits under a constellation of the contact
 * channels, a CV log lectern faces the plaza from the east, and a star chart carries the about card.
 * Far skyline silhouettes ring the tower.
 */
export function Observatory({ layout, roof, profile, labels, tier, reducedMotion, active }: RoofSceneryProps) {
  const scene = useMemo(() => {
    const { centerpiece: cp, comms, cv, about } = layout;
    const commsX = mid(comms.minX, comms.maxX);
    const commsZ = mid(comms.minZ, comms.maxZ);
    const cvZ = mid(cv.minZ, cv.maxZ);
    const aboutX = mid(about.minX, about.maxX);
    const plateZ = cp.maxZ - 0.06;
    const solids: Box[] = [
      { x: cp.center.x, y: 0, z: cp.center.z, w: 4, h: 0.6, d: 4 },
      { x: cp.center.x, y: 0.6, z: cp.center.z, w: 1.2, h: 2.2, d: 1.2 },
      { x: cp.center.x, y: 0.9, z: plateZ, w: 3.8, h: 1.5, d: 0.08 },
      { x: commsX, y: 0, z: comms.maxZ - 1, w: 10, h: 1, d: 1.4 },
      { x: commsX, y: 0, z: commsZ - 1, w: 1.4, h: 2.2, d: 1.4 },
      { x: cv.minX + 1.2, y: 0, z: cvZ, w: 1.6, h: 1.2, d: 3.2 },
      { x: cv.maxX - 0.6, y: 0, z: cvZ, w: 0.4, h: 3.4, d: 5 },
      { x: aboutX, y: 0, z: about.minZ + 0.8, w: 7.6, h: 3.8, d: 0.4 },
    ];
    const stars = layout.channelSlots.map((s, i) => ({ x: s.x, y: 8.6 + (i % 2) * 1.4, z: s.z + 0.5 }));
    const text: BatchedLabel[] = [
      { text: labels.availability.toUpperCase(), position: [cp.center.x, 2.2, plateZ + 0.05], font: FONTS.mono, fontSize: 0.14, color: ROOF_BLUE, letterSpacing: 0.12 },
      { text: roof.availability, position: [cp.center.x, 1.55, plateZ + 0.05], font: FONTS.sansBold, fontSize: 0.19, color: "#eff6ff", maxWidth: 3.5, textAlign: "center", lineHeight: 1.2 },
      { text: labels.email.toUpperCase(), position: [commsX, 0.78, comms.maxZ - 0.28], font: FONTS.mono, fontSize: 0.14, color: ROOF_BLUE, letterSpacing: 0.12 },
      { text: roof.email, position: [commsX, 0.45, comms.maxZ - 0.28], font: FONTS.monoBold, fontSize: 0.24, color: "#dbeafe" },
      { text: labels.comms.toUpperCase(), position: [commsX, 11.6, commsZ + 0.5], font: FONTS.monoBold, fontSize: 0.42, color: ROOF_BLUE, letterSpacing: 0.14 },
      ...stars.map((s, i): BatchedLabel => ({ text: roof.channels[i]?.label ?? "", position: [s.x, s.y - 0.6, s.z], font: FONTS.sansBold, fontSize: 0.3, color: "#e0e7ff" })),
      { text: labels.cvTitle.toUpperCase(), position: [cv.maxX - 0.82, 2.7, cvZ], yaw: -Math.PI / 2, font: FONTS.monoBold, fontSize: 0.3, color: ROOF_CYAN, letterSpacing: 0.1 },
      { text: labels.cvHint, position: [cv.maxX - 0.82, 2.2, cvZ], yaw: -Math.PI / 2, font: FONTS.mono, fontSize: 0.17, color: "#cffafe", maxWidth: 4.4, textAlign: "center" },
      ...aboutCard({ x: aboutX, z: about.minZ + 0.56, top: 3.4, yaw: Math.PI, width: 7 }, profile, roof, labels),
    ];
    const icons = {
      email: [{ x: commsX, y: 2.4, z: comms.maxZ - 1, face: 0 }],
      cv: [{ x: cv.minX + 1.2, y: 2.3, z: cvZ, face: -Math.PI / 2 }],
      about: [{ x: aboutX, y: 4.8, z: about.minZ + 0.8, face: Math.PI }],
    };
    return { solids, stars, text, icons, dish: { x: commsX, z: commsZ - 1 } };
  }, [layout, roof, profile, labels]);

  return (
    <group name="roof-observatory">
      <Skyline tier={tier} />
      <MergedBoxes boxes={scene.solids} color="#0b0b18" emissive={ROOF_BLUE} emissiveIntensity={0.08} />
      <MergedEdges boxes={scene.solids} color={ROOF_BLUE} tier={tier} />
      <Telescope at={layout.centerpiece.center} tier={tier} reducedMotion={reducedMotion} active={active} />
      <Dish at={scene.dish} tier={tier} reducedMotion={reducedMotion} active={active} />
      <Constellation stars={scene.stars} tier={tier} />
      <BatchedLabels labels={scene.text} name="roof-labels" />
      <HoloIcon strokes={ROOF_ICONS.email} instances={scene.icons.email} color={ROOF_BLUE} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HoloIcon strokes={ROOF_ICONS.cv} instances={scene.icons.cv} color={ROOF_CYAN} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HoloIcon strokes={ROOF_ICONS.about} instances={scene.icons.about} color={ROOF_VIOLET} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HitBox rect={layout.comms} h={4} room="RF:contact" />
      <HitBox rect={layout.comms} y={7.5} h={4} room="RF:contact" />
      <HitBox rect={layout.cv} h={3.6} room="RF:cv" />
    </group>
  );
}
