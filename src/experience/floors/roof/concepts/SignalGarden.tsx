"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, Object3D, type InstancedMesh, type MeshBasicMaterial } from "three";
import { BatchedLabels } from "../../../fx/BatchedLabels";
import { HoloIcon } from "../../../fx/HoloIcon";
import { ROOF_ICONS } from "../../../fx/holoIcons";
import type { BatchedLabel } from "../../../fx/labelProps";
import { neonColor } from "../../../fx/materials";
import { ROAD } from "../../../nav/road";
import { FONTS } from "../../../tower/primitives";
import type { GpuTier, Vec2 } from "../../../types";
import { aboutCard, CHANNEL_TONE, HitBox, MergedBoxes, MergedEdges, PulseRings, ROOF_BLUE, ROOF_CYAN, ROOF_VIOLET, type PulseSource, type RoofSceneryProps } from "../kit";
import { latticeSegments, roofDetail, scatter, type Box } from "../solids";

const mid = (a: number, b: number) => (a + b) / 2;
const MAST_HEIGHT = 14;

/** The lattice antenna mast on the plaza (one line draw call). */
function Mast({ at, tier }: { at: Vec2; tier: GpuTier }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(latticeSegments(MAST_HEIGHT, 1.6, 0.35, 7), 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const neon = useMemo(() => neonColor(ROOF_BLUE, 1.5, tier), [tier]);
  return (
    <lineSegments geometry={geometry} position={[at.x, 0.5, at.z]} raycast={() => null}>
      <lineBasicMaterial color={neon} transparent opacity={0.9} toneMapped={false} />
    </lineSegments>
  );
}

/** Neon glow behind the availability sign: a slow breath, still under reduced motion. */
function SignGlow({ at, tier, reducedMotion }: { at: [number, number, number]; tier: GpuTier; reducedMotion: boolean }) {
  const material = useRef<MeshBasicMaterial>(null);
  useFrame((state) => {
    if (!material.current) return;
    material.current.opacity = reducedMotion ? 0.22 : 0.18 + Math.sin(state.clock.elapsedTime * 1.3) * 0.06;
  });
  return (
    <mesh position={at} raycast={() => null}>
      <planeGeometry args={[6, 2.2]} />
      <meshBasicMaterial ref={material} color={ROOF_BLUE} transparent opacity={0.22} blending={tier === "full" ? AdditiveBlending : NormalBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Glowing floor lights in the channel hues, flat on the deck (one instanced draw call). */
function Flowers({ spots, tier }: { spots: readonly Vec2[]; tier: GpuTier }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    const color = new Color();
    const tones = Object.values(CHANNEL_TONE);
    spots.forEach((p, i) => {
      o.position.set(p.x, 0.04, p.z);
      o.rotation.set(-Math.PI / 2, 0, (i * 2.4) % (Math.PI * 2));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, color.set(tones[i % tones.length]));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [spots]);
  if (!spots.length) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, spots.length]} raycast={() => null}>
      <circleGeometry args={[0.24, 5]} />
      <meshBasicMaterial transparent opacity={tier === "full" ? 0.9 : 0.75} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

/**
 * Concept C, "Signal Garden / Comms Tower": a lattice mast rises from the plaza with signal rings at
 * its top and the availability as a neon sign. The comms station is a garden of small antennas, one
 * per contact channel, each ringing in its own hue (faster while the comms room is open); glowing
 * floor lights dot the deck. The CV sits at a kiosk facing the plaza and the about card is a story
 * wall with a bench in front.
 */
export function SignalGarden({ layout, roof, profile, labels, tier, reducedMotion, active }: RoofSceneryProps) {
  const detail = roofDetail(tier);
  const scene = useMemo(() => {
    const { centerpiece: cp, comms, cv, about } = layout;
    const c = cp.center;
    const commsX = mid(comms.minX, comms.maxX);
    const commsZ = mid(comms.minZ, comms.maxZ);
    const cvZ = mid(cv.minZ, cv.maxZ);
    const aboutX = mid(about.minX, about.maxX);
    const signZ = c.z + 1.5;
    const solids: Box[] = [
      { x: c.x, y: 0, z: c.z, w: 4, h: 0.5, d: 4 },
      { x: c.x, y: 4.2, z: signZ, w: 5.6, h: 1.8, d: 0.12 },
      { x: commsX, y: 0, z: commsZ, w: 12, h: 0.3, d: 6 },
      ...layout.channelSlots.map((s): Box => ({ x: s.x, y: 0.3, z: s.z, w: 0.25, h: 2.6, d: 0.25 })),
      { x: commsX, y: 0.3, z: comms.maxZ - 0.8, w: 6, h: 0.9, d: 1 },
      { x: cv.minX + 2, y: 0, z: cvZ, w: 2.4, h: 1.3, d: 4 },
      { x: cv.minX + 3.4, y: 1.3, z: cvZ, w: 0.2, h: 2.2, d: 4 },
      { x: aboutX, y: 0, z: about.maxZ - 0.6, w: 7.6, h: 3.4, d: 0.4 },
      { x: aboutX, y: 0, z: about.minZ + 0.9, w: 5, h: 0.5, d: 1.2 },
    ];
    const mastRings: PulseSource[] = [0, 1 / 3, 2 / 3].map((phase) => ({ x: c.x, y: MAST_HEIGHT + 0.6, z: c.z, color: ROOF_BLUE, phase }));
    const channelRings: PulseSource[] = layout.channelSlots.map((s, i) => ({ x: s.x, y: 3.0, z: s.z, color: CHANNEL_TONE[roof.channels[i]?.id ?? "googleScholar"] }));
    const text: BatchedLabel[] = [
      { text: labels.availability.toUpperCase(), position: [c.x, 5.6, signZ + 0.08], font: FONTS.mono, fontSize: 0.16, color: ROOF_BLUE, letterSpacing: 0.14 },
      { text: roof.availability, position: [c.x, 4.95, signZ + 0.08], font: FONTS.sansBold, fontSize: 0.24, color: "#eff6ff", maxWidth: 5.2, textAlign: "center", lineHeight: 1.2 },
      { text: labels.comms.toUpperCase(), position: [commsX, 5, commsZ], font: FONTS.monoBold, fontSize: 0.4, color: ROOF_BLUE, letterSpacing: 0.14 },
      ...layout.channelSlots.map((s, i): BatchedLabel => ({ text: roof.channels[i]?.label ?? "", position: [s.x, 3.6, s.z + 0.2], font: FONTS.sansBold, fontSize: 0.26, color: "#e0e7ff" })),
      { text: labels.email.toUpperCase(), position: [commsX, 0.98, comms.maxZ - 0.28], font: FONTS.mono, fontSize: 0.14, color: ROOF_BLUE, letterSpacing: 0.12 },
      { text: roof.email, position: [commsX, 0.65, comms.maxZ - 0.28], font: FONTS.monoBold, fontSize: 0.24, color: "#dbeafe" },
      { text: labels.cvTitle.toUpperCase(), position: [cv.minX + 3.28, 3.0, cvZ], yaw: -Math.PI / 2, font: FONTS.monoBold, fontSize: 0.3, color: ROOF_CYAN, letterSpacing: 0.1 },
      { text: labels.cvHint, position: [cv.minX + 3.28, 2.4, cvZ], yaw: -Math.PI / 2, font: FONTS.mono, fontSize: 0.17, color: "#cffafe", maxWidth: 3.6, textAlign: "center" },
      ...aboutCard({ x: aboutX, z: about.maxZ - 0.82, top: 3.1, yaw: Math.PI, width: 7 }, profile, roof, labels),
    ];
    const b = layout.floor.bounds;
    const pad = layout.callPad;
    const plazaR = layout.plaza.w / 2;
    const near = (p: Vec2, r: { minX: number; maxX: number; minZ: number; maxZ: number }, m: number) => p.x > r.minX - m && p.x < r.maxX + m && p.z > r.minZ - m && p.z < r.maxZ + m;
    const spots = scatter(
      detail.flowers,
      { minX: b.minX + 1, maxX: b.maxX - 1, minZ: b.minZ + 1, maxZ: b.maxZ - 1 },
      (p) =>
        near(p, pad, 1) ||
        (p.x < c.x && Math.abs(p.z - c.z) < ROAD.minWidth / 2 + 1) ||
        Math.hypot(p.x - c.x, p.z - c.z) < plazaR + 0.5 ||
        layout.floor.obstacles.some((o) => near(p, o, 0.5)) ||
        Object.values(layout.stops).some((s) => Math.hypot(p.x - s.x, p.z - s.z) < 2.5),
    );
    const icons = {
      email: [{ x: commsX, y: 2.4, z: comms.maxZ - 0.8, face: 0 }],
      cv: [{ x: cv.minX + 3.4, y: 4.4, z: cvZ, face: -Math.PI / 2 }],
      about: [{ x: aboutX, y: 4.6, z: about.maxZ - 0.6, face: Math.PI }],
    };
    return { solids, mastRings, channelRings, text, spots, icons, sign: [c.x, 5.1, signZ + 0.07] as [number, number, number] };
  }, [layout, roof, profile, labels, detail.flowers]);
  const sending = active === "contact";

  return (
    <group name="roof-signal-garden">
      <MergedBoxes boxes={scene.solids} color="#0b0b18" emissive={ROOF_BLUE} emissiveIntensity={0.08} />
      <MergedEdges boxes={scene.solids} color={ROOF_BLUE} tier={tier} />
      <Mast at={layout.centerpiece.center} tier={tier} />
      <PulseRings sources={scene.mastRings} radius={0.8} grow={sending ? 12 : 8} speed={sending ? 0.8 : 0.3} tier={tier} reducedMotion={reducedMotion} />
      <PulseRings sources={scene.channelRings} radius={0.3} grow={sending ? 5 : 3} speed={sending ? 1.3 : 0.5} tier={tier} reducedMotion={reducedMotion} />
      <SignGlow at={scene.sign} tier={tier} reducedMotion={reducedMotion} />
      <Flowers spots={scene.spots} tier={tier} />
      <BatchedLabels labels={scene.text} name="roof-labels" />
      <HoloIcon strokes={ROOF_ICONS.email} instances={scene.icons.email} color={ROOF_BLUE} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HoloIcon strokes={ROOF_ICONS.cv} instances={scene.icons.cv} color={ROOF_CYAN} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HoloIcon strokes={ROOF_ICONS.about} instances={scene.icons.about} color={ROOF_VIOLET} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HitBox rect={layout.comms} h={4} room="RF:contact" />
      <HitBox rect={layout.cv} h={3.6} room="RF:cv" />
    </group>
  );
}
