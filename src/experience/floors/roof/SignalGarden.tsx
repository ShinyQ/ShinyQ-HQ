"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, NormalBlending, Object3D, type Group, type InstancedMesh, type MeshBasicMaterial } from "three";
import { BatchedLabels } from "../../fx/BatchedLabels";
import { HoloIcon } from "../../fx/HoloIcon";
import { ROOF_ICONS } from "../../fx/holoIcons";
import type { BatchedLabel } from "../../fx/labelProps";
import { neonColor } from "../../fx/materials";
import { ROAD } from "../../nav/road";
import { FONTS } from "../../tower/primitives";
import type { GpuTier, Vec2 } from "../../types";
import { aboutCard, CHANNEL_TONE, MergedBoxes, MergedEdges, PulseRings, ROOF_BLUE, ROOF_CYAN, ROOF_VIOLET, type PulseSource, type RoofSceneryProps } from "./kit";
import { ROOF_DECK, type RoofActive } from "./layout";
import { observatoryParts } from "./observatory";
import { latticeSegments, roofDetail, scatter, type Box } from "./solids";

const mid = (a: number, b: number) => (a + b) / 2;
const MAST_HEIGHT = 14;
/** The availability sign hangs on the mast, facing the spawn camera head on. */
const SIGN_YAW = ROOF_DECK.signYaw;
const SIGN = { offset: 2.3, bottom: 4.2, w: 8, h: 3.4, fontSize: 0.5 } as const;
/** The drone patrols round the mast above the sign. */
const DRONE = { radius: 3.4, height: 9, speed: 0.35 } as const;

type V3 = [number, number, number];
type DroneTarget = Exclude<RoofActive, null>;
const DRONE_CARGO: Record<DroneTarget, { icon: keyof typeof ROOF_ICONS; color: string }> = {
  contact: { icon: "email", color: ROOF_BLUE },
  cv: { icon: "cv", color: ROOF_CYAN },
  visits: { icon: "globe", color: ROOF_VIOLET },
};

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
function SignGlow({ at, yaw, size, tier, reducedMotion }: { at: V3; yaw: number; size: [number, number]; tier: GpuTier; reducedMotion: boolean }) {
  const material = useRef<MeshBasicMaterial>(null);
  useFrame((state) => {
    if (!material.current) return;
    material.current.opacity = reducedMotion ? 0.22 : 0.18 + Math.sin(state.clock.elapsedTime * 1.3) * 0.06;
  });
  return (
    <mesh position={at} rotation={[0, yaw, 0]} raycast={() => null}>
      <planeGeometry args={size} />
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

const DRONE_BODY: Box[] = [
  { x: 0, y: 0, z: 0, w: 1.4, h: 0.45, d: 1.4 },
  { x: 0, y: 0.18, z: 0, w: 3.6, h: 0.1, d: 0.22, yaw: Math.PI / 4 },
  { x: 0, y: 0.18, z: 0, w: 3.6, h: 0.1, d: 0.22, yaw: -Math.PI / 4 },
];
const DRONE_ICON = [{ x: 0, y: 1.9, z: 0, face: SIGN_YAW }];

/**
 * The courier drone (from concept B): it patrols round the mast and, while the comms or CV room is
 * open, lifts off and hovers over that station carrying the email or the CV icon. Reduced motion
 * parks it east of the mast and moves it without easing.
 */
function Drone({ mast, targets, active, tier, reducedMotion }: { mast: Vec2; targets: Record<DroneTarget, V3>; active: RoofActive; tier: GpuTier; reducedMotion: boolean }) {
  const group = useRef<Group>(null);
  const rotors = useRef<InstancedMesh>(null);
  const angle = useRef(0);
  useLayoutEffect(() => {
    const m = rotors.current;
    if (!m) return;
    const o = new Object3D();
    [[1.27, 1.27], [-1.27, 1.27], [1.27, -1.27], [-1.27, -1.27]].forEach(([x, z], i) => {
      o.position.set(x, 0.32, z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, []);
  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    if (!reducedMotion && !active) angle.current += dt * DRONE.speed;
    const bob = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 1.6) * 0.15;
    const [x, y, z] = active ? targets[active] : [mast.x + Math.cos(angle.current) * DRONE.radius, DRONE.height, mast.z + Math.sin(angle.current) * DRONE.radius];
    const k = reducedMotion ? 1 : Math.min(1, dt * 1.8);
    g.position.set(g.position.x + (x - g.position.x) * k, g.position.y + (y + bob - g.position.y) * k, g.position.z + (z - g.position.z) * k);
    if (!reducedMotion) g.rotation.y += dt * (active ? 0.8 : 0.3);
  });
  return (
    <group ref={group} position={[mast.x + DRONE.radius, DRONE.height, mast.z]} name="drone">
      <MergedBoxes boxes={DRONE_BODY} color="#111827" emissive={ROOF_BLUE} emissiveIntensity={0.3} />
      <instancedMesh ref={rotors} args={[undefined, undefined, 4]} raycast={() => null}>
        <circleGeometry args={[0.62, 20]} />
        <meshBasicMaterial color={ROOF_BLUE} transparent opacity={0.45} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </instancedMesh>
      {active && <HoloIcon strokes={ROOF_ICONS[DRONE_CARGO[active].icon]} instances={DRONE_ICON} color={DRONE_CARGO[active].color} size={1.4} tier={tier} reducedMotion={reducedMotion} />}
    </group>
  );
}

/**
 * RF roof scenery, "Signal Garden" with the courier drone (owner pick: concept C plus B's drone).
 * A lattice mast rises from the plaza with signal rings at its top and the availability as a large
 * neon sign facing the spawn camera; a drone patrols the mast and flies to the comms or CV station
 * while that room is open. The comms station is a garden of antennas, one per contact channel,
 * each ringing in its own hue (faster while the comms room is open); glowing floor lights dot the
 * deck. The CV sits at a kiosk facing the plaza and the about card is a story wall with a bench.
 */
export function SignalGarden({ layout, roof, profile, labels, tier, reducedMotion, active }: RoofSceneryProps) {
  const detail = roofDetail(tier);
  const scene = useMemo(() => {
    const { centerpiece: cp, comms, cv, about } = layout;
    const observatory = observatoryParts(layout);
    const c = cp.center;
    const commsX = mid(comms.minX, comms.maxX);
    const commsZ = mid(comms.minZ, comms.maxZ);
    const cvZ = mid(cv.minZ, cv.maxZ);
    const aboutX = mid(about.minX, about.maxX);
    const nx = Math.sin(SIGN_YAW);
    const nz = Math.cos(SIGN_YAW);
    const sign = { x: c.x + nx * SIGN.offset, z: c.z + nz * SIGN.offset };
    const face = (d: number, y: number): V3 => [sign.x + nx * d, y, sign.z + nz * d];
    // Odd channels stand taller so their labels sit on a second row and never overlap.
    const antenna = (i: number) => (i % 2 ? 3.4 : 2.6);
    const ringY = (i: number) => 0.3 + antenna(i) + 0.15;
    const solids: Box[] = [
      { x: c.x, y: 0, z: c.z, w: 4, h: 0.5, d: 4 },
      { x: sign.x, y: SIGN.bottom, z: sign.z, w: SIGN.w, h: SIGN.h, d: 0.12, yaw: SIGN_YAW },
      { x: commsX, y: 0, z: commsZ, w: 12, h: 0.3, d: 6 },
      ...layout.channelSlots.map((s, i): Box => ({ x: s.x, y: 0.3, z: s.z, w: 0.25, h: antenna(i), d: 0.25 })),
      { x: commsX, y: 0.3, z: comms.maxZ - 0.8, w: 6, h: 0.9, d: 1 },
      { x: cv.minX + 2, y: 0, z: cvZ, w: 2.4, h: 1.3, d: 4 },
      { x: cv.minX + 3.4, y: 1.3, z: cvZ, w: 0.2, h: 2.2, d: 4 },
      { x: aboutX, y: 0, z: about.maxZ - 0.6, w: 7.6, h: 3.4, d: 0.4 },
      { x: aboutX, y: 0, z: about.minZ + 0.9, w: 5, h: 0.5, d: 1.2 },
      // The Visitor Observatory's plinth, globe pedestal and panel post (its globe and panel: VisitsStation).
      ...observatory.solids,
    ];
    const mastRings: PulseSource[] = [0, 1 / 3, 2 / 3].map((phase) => ({ x: c.x, y: MAST_HEIGHT + 0.6, z: c.z, color: ROOF_BLUE, phase }));
    const channelRings: PulseSource[] = layout.channelSlots.map((s, i) => ({ x: s.x, y: ringY(i), z: s.z, color: CHANNEL_TONE[roof.channels[i]?.id ?? "googleScholar"] }));
    const signTop = SIGN.bottom + SIGN.h;
    const text: BatchedLabel[] = [
      { text: labels.availability.toUpperCase(), position: face(0.08, signTop - 0.4), yaw: SIGN_YAW, font: FONTS.monoBold, fontSize: 0.28, color: ROOF_BLUE, letterSpacing: 0.16 },
      { text: roof.availability, position: face(0.08, SIGN.bottom + (SIGN.h - 0.7) / 2), yaw: SIGN_YAW, font: FONTS.sansBold, fontSize: SIGN.fontSize, color: "#eff6ff", maxWidth: SIGN.w - 0.8, textAlign: "center", lineHeight: 1.15 },
      { text: labels.comms.toUpperCase(), position: [commsX, 5.6, commsZ], font: FONTS.monoBold, fontSize: 0.44, color: ROOF_BLUE, letterSpacing: 0.14 },
      ...layout.channelSlots.map((s, i): BatchedLabel => ({ text: roof.channels[i]?.label ?? "", position: [s.x, ringY(i) + 0.6, s.z + 0.2], font: FONTS.sansBold, fontSize: 0.38, color: "#e0e7ff" })),
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
        Object.values(layout.stops).some((s) => Math.hypot(p.x - s.x, p.z - s.z) < 2.5) ||
        Math.hypot(p.x - layout.floor.spawn.x, p.z - layout.floor.spawn.z) < 2.5,
    );
    const icons = {
      email: [{ x: commsX, y: 2.4, z: comms.maxZ - 0.8, face: 0 }],
      cv: [{ x: cv.minX + 3.4, y: 4.4, z: cvZ, face: -Math.PI / 2 }],
      about: [{ x: aboutX, y: 4.6, z: about.maxZ - 0.6, face: Math.PI }],
    };
    const { globe } = observatory;
    const droneTargets: Record<DroneTarget, V3> = { contact: [commsX, 8.4, commsZ + 1], cv: [cv.minX + 2, 6.4, cvZ], visits: [globe.x - 2.6, globe.y + globe.r + 1.6, globe.z + 1.4] };
    return { solids, mastRings, channelRings, text, spots, icons, droneTargets, glow: face(0.07, SIGN.bottom + SIGN.h / 2) };
  }, [layout, roof, profile, labels, detail.flowers]);
  const sending = active === "contact";

  return (
    <group name="roof-signal-garden">
      <MergedBoxes boxes={scene.solids} color="#0b0b18" emissive={ROOF_BLUE} emissiveIntensity={0.08} />
      <MergedEdges boxes={scene.solids} color={ROOF_BLUE} tier={tier} />
      <Mast at={layout.centerpiece.center} tier={tier} />
      <PulseRings sources={scene.mastRings} radius={0.8} grow={sending ? 12 : 8} speed={sending ? 0.8 : 0.3} tier={tier} reducedMotion={reducedMotion} />
      <PulseRings sources={scene.channelRings} radius={0.3} grow={sending ? 5 : 3} speed={sending ? 1.3 : 0.5} tier={tier} reducedMotion={reducedMotion} />
      <SignGlow at={scene.glow} yaw={SIGN_YAW} size={[SIGN.w - 0.2, SIGN.h - 0.2]} tier={tier} reducedMotion={reducedMotion} />
      <Flowers spots={scene.spots} tier={tier} />
      <Drone mast={layout.centerpiece.center} targets={scene.droneTargets} active={active} tier={tier} reducedMotion={reducedMotion} />
      <BatchedLabels labels={scene.text} name="roof-labels" />
      <HoloIcon strokes={ROOF_ICONS.email} instances={scene.icons.email} color={ROOF_BLUE} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HoloIcon strokes={ROOF_ICONS.cv} instances={scene.icons.cv} color={ROOF_CYAN} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HoloIcon strokes={ROOF_ICONS.about} instances={scene.icons.about} color={ROOF_VIOLET} size={1.6} tier={tier} reducedMotion={reducedMotion} />
    </group>
  );
}
