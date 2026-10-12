"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry, DoubleSide, InstancedBufferAttribute, Object3D, ShaderMaterial, type Group, type InstancedMesh } from "three";
import { BatchedLabels } from "../../../fx/BatchedLabels";
import { HoloIcon } from "../../../fx/HoloIcon";
import { ROOF_ICONS } from "../../../fx/holoIcons";
import type { BatchedLabel } from "../../../fx/labelProps";
import { neonColor } from "../../../fx/materials";
import { useUniformTime } from "../../../fx/useUniformTime";
import { FONTS } from "../../../tower/primitives";
import type { GpuTier, Vec2 } from "../../../types";
import { aboutCard, CHANNEL_TONE, HitBox, MergedBoxes, MergedEdges, PulseRings, ROOF_BLUE, ROOF_CYAN, ROOF_VIOLET, type PulseSource, type RoofSceneryProps } from "../kit";
import type { RoofActive } from "../layout";
import { ringPoints, type Box } from "../solids";

const mid = (a: number, b: number) => (a + b) / 2;
const AMBER = "#fbbf24";

const CHASE_VS = `attribute float aPhase; uniform float uTime; uniform float uChase; varying float vGlow;
void main(){ float k = fract(aPhase - uTime*.35); vGlow = mix(.7, .25 + .75*pow(1. - k, 6.), uChase);
  gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position, 1.); }`;
const CHASE_FS = `uniform vec3 uColor; varying float vGlow; void main(){ gl_FragColor = vec4(uColor*vGlow, 1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/** Runway lights round the pad: one instanced draw, a light running round it (steady under reduced motion). */
function PadLights({ points, tier, reducedMotion }: { points: readonly Vec2[]; tier: GpuTier; reducedMotion: boolean }) {
  const geometry = useMemo(() => {
    const g = new BoxGeometry(0.35, 0.12, 0.35);
    g.setAttribute("aPhase", new InstancedBufferAttribute(new Float32Array(points.map((_, i) => i / points.length)), 1));
    return g;
  }, [points]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uChase: { value: reducedMotion ? 0 : 1 }, uColor: { value: neonColor(AMBER, tier === "full" ? 1.8 : 1, tier) } },
        vertexShader: CHASE_VS,
        fragmentShader: CHASE_FS,
      }),
    [reducedMotion, tier],
  );
  const materials = useMemo(() => [material], [material]);
  useUniformTime(materials);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    points.forEach((p, i) => {
      o.position.set(p.x, 0.06, p.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [points, geometry, material]);
  return <instancedMesh ref={mesh} args={[geometry, material, points.length]} frustumCulled={false} raycast={() => null} />;
}

/** The drone: hovers over its cradle and lifts off carrying the email or the CV icon while that room is open. */
function Drone({ at, active, tier, reducedMotion }: { at: Vec2; active: RoofActive; tier: GpuTier; reducedMotion: boolean }) {
  const group = useRef<Group>(null);
  const rotors = useRef<InstancedMesh>(null);
  const body = useMemo<Box[]>(
    () => [
      { x: 0, y: 0, z: 0, w: 1.4, h: 0.45, d: 1.4 },
      { x: 0, y: 0.18, z: 0, w: 3.6, h: 0.1, d: 0.22, yaw: Math.PI / 4 },
      { x: 0, y: 0.18, z: 0, w: 3.6, h: 0.1, d: 0.22, yaw: -Math.PI / 4 },
    ],
    [],
  );
  const icon = useMemo(() => [{ x: 0, y: 1.9, z: 0, face: 0 }], []);
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
    const lift = active ? 5 : 1.9;
    const y = lift + (reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 1.6) * 0.12);
    g.position.y = reducedMotion ? y : g.position.y + (y - g.position.y) * Math.min(1, dt * 2.5);
    if (!reducedMotion && active) g.rotation.y += dt * 0.6;
  });
  return (
    <group ref={group} position={[at.x, 1.9, at.z]} name="drone">
      <MergedBoxes boxes={body} color="#111827" emissive={ROOF_BLUE} emissiveIntensity={0.3} />
      <instancedMesh ref={rotors} args={[undefined, undefined, 4]} raycast={() => null}>
        <circleGeometry args={[0.62, 20]} />
        <meshBasicMaterial color={ROOF_BLUE} transparent opacity={0.45} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </instancedMesh>
      {active && <HoloIcon strokes={active === "cv" ? ROOF_ICONS.cv : ROOF_ICONS.email} instances={icon} color={active === "cv" ? ROOF_CYAN : ROOF_BLUE} size={1.4} tier={tier} reducedMotion={reducedMotion} />}
    </group>
  );
}

/**
 * Concept B, "Helipad Launch Deck": the plaza is a landing pad with an "H" and runway lights running
 * round it. A drone hovers over the central cradle (its status board shows the availability) and
 * lifts off with the email or the CV when you open them. A beacon tower per contact channel pulses
 * in its own hue on the comms station, the CV sits in a hangar facing the pad, and a departures
 * board carries the about card.
 */
export function Helipad({ layout, roof, profile, labels, tier, reducedMotion, active }: RoofSceneryProps) {
  const scene = useMemo(() => {
    const { centerpiece: cp, comms, cv, about } = layout;
    const c = cp.center;
    const commsX = mid(comms.minX, comms.maxX);
    const commsZ = mid(comms.minZ, comms.maxZ);
    const cvX = mid(cv.minX, cv.maxX);
    const cvZ = mid(cv.minZ, cv.maxZ);
    const aboutX = mid(about.minX, about.maxX);
    const solids: Box[] = [
      { x: c.x, y: 0, z: c.z, w: 4, h: 0.4, d: 4 },
      { x: c.x, y: 0.4, z: cp.maxZ - 0.15, w: 3.6, h: 1.2, d: 0.1 },
      { x: commsX, y: 0, z: commsZ, w: 12, h: 0.4, d: 6 },
      ...layout.channelSlots.map((s): Box => ({ x: s.x, y: 0.4, z: s.z, w: 0.5, h: 4.6, d: 0.5 })),
      { x: commsX, y: 0.4, z: comms.maxZ - 0.8, w: 6, h: 0.9, d: 1 },
      { x: cvX + 0.5, y: 0, z: cvZ, w: 5, h: 3.2, d: 5.6 },
      { x: cv.minX + 0.95, y: 0.8, z: cvZ, w: 0.08, h: 1.9, d: 4 },
      { x: aboutX - 3.2, y: 0, z: about.minZ + 1, w: 0.3, h: 2, d: 0.3 },
      { x: aboutX + 3.2, y: 0, z: about.minZ + 1, w: 0.3, h: 2, d: 0.3 },
      { x: aboutX, y: 2, z: about.minZ + 1, w: 7.6, h: 2.6, d: 0.3 },
    ];
    const beacons: PulseSource[] = layout.channelSlots.map((s, i) => ({ x: s.x, y: 5.2, z: s.z, color: CHANNEL_TONE[roof.channels[i]?.id ?? "googleScholar"] }));
    const text: BatchedLabel[] = [
      { text: labels.availability.toUpperCase(), position: [c.x, 1.35, cp.maxZ - 0.09], font: FONTS.mono, fontSize: 0.13, color: AMBER, letterSpacing: 0.12 },
      { text: roof.availability, position: [c.x, 0.9, cp.maxZ - 0.09], font: FONTS.sansBold, fontSize: 0.15, color: "#fef3c7", maxWidth: 3.4, textAlign: "center", lineHeight: 1.15 },
      { text: labels.comms.toUpperCase(), position: [commsX, 7, commsZ], font: FONTS.monoBold, fontSize: 0.42, color: ROOF_BLUE, letterSpacing: 0.14 },
      ...layout.channelSlots.map((s, i): BatchedLabel => ({ text: roof.channels[i]?.label ?? "", position: [s.x, 5.9, s.z + 0.4], font: FONTS.sansBold, fontSize: 0.28, color: "#e0e7ff" })),
      { text: labels.email.toUpperCase(), position: [commsX, 1.08, comms.maxZ - 0.28], font: FONTS.mono, fontSize: 0.14, color: ROOF_BLUE, letterSpacing: 0.12 },
      { text: roof.email, position: [commsX, 0.75, comms.maxZ - 0.28], font: FONTS.monoBold, fontSize: 0.24, color: "#dbeafe" },
      { text: labels.cvTitle.toUpperCase(), position: [cv.minX + 0.89, 2.2, cvZ], yaw: -Math.PI / 2, font: FONTS.monoBold, fontSize: 0.3, color: ROOF_CYAN, letterSpacing: 0.1 },
      { text: labels.cvHint, position: [cv.minX + 0.89, 1.6, cvZ], yaw: -Math.PI / 2, font: FONTS.mono, fontSize: 0.17, color: "#cffafe", maxWidth: 3.6, textAlign: "center" },
      ...aboutCard({ x: aboutX, z: about.minZ + 0.83, top: 4.25, yaw: Math.PI, width: 7.2 }, profile, roof, labels),
    ];
    const marks: number[] = [];
    const y = 0.06;
    const ring = ringPoints(c, 8, 48);
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      marks.push(p.x, y, p.z, q.x, y, q.z);
    });
    marks.push(c.x - 3, y, c.z - 3.5, c.x - 3, y, c.z + 3.5, c.x + 3, y, c.z - 3.5, c.x + 3, y, c.z + 3.5, c.x - 3, y, c.z, c.x + 3, y, c.z);
    const icons = {
      email: [{ x: commsX, y: 2.6, z: comms.maxZ - 0.8, face: 0 }],
      cv: [{ x: cvX + 0.5, y: 4.6, z: cvZ, face: -Math.PI / 2 }],
      about: [{ x: aboutX, y: 5.6, z: about.minZ + 1, face: Math.PI }],
    };
    return { solids, beacons, text, marks: new Float32Array(marks), lights: ringPoints(c, 9.4, 24), icons };
  }, [layout, roof, profile, labels]);

  const marks = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(scene.marks, 3));
    return g;
  }, [scene.marks]);
  useEffect(() => () => marks.dispose(), [marks]);
  const sending = active === "contact";

  return (
    <group name="roof-helipad">
      <MergedBoxes boxes={scene.solids} color="#0b0b18" emissive={ROOF_BLUE} emissiveIntensity={0.08} />
      <MergedEdges boxes={scene.solids} color={ROOF_BLUE} tier={tier} />
      <lineSegments geometry={marks} raycast={() => null}>
        <lineBasicMaterial color={AMBER} transparent opacity={0.8} toneMapped={false} />
      </lineSegments>
      <PadLights points={scene.lights} tier={tier} reducedMotion={reducedMotion} />
      <Drone at={layout.centerpiece.center} active={active} tier={tier} reducedMotion={reducedMotion} />
      <PulseRings sources={scene.beacons} radius={0.35} grow={sending ? 5 : 2.5} speed={sending ? 1.1 : 0.45} tier={tier} reducedMotion={reducedMotion} />
      <BatchedLabels labels={scene.text} name="roof-labels" />
      <HoloIcon strokes={ROOF_ICONS.email} instances={scene.icons.email} color={ROOF_BLUE} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HoloIcon strokes={ROOF_ICONS.cv} instances={scene.icons.cv} color={ROOF_CYAN} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HoloIcon strokes={ROOF_ICONS.about} instances={scene.icons.about} color={ROOF_VIOLET} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HitBox rect={layout.comms} h={6} room="RF:contact" />
      <HitBox rect={layout.cv} h={3.4} room="RF:cv" />
    </group>
  );
}
