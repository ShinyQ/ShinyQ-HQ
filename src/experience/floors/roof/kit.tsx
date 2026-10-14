"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  NormalBlending,
  Object3D,
  RingGeometry,
  ShaderMaterial,
  type InstancedMesh,
} from "three";
import type { BatchedLabel } from "../../fx/labelProps";
import { neonColor } from "../../fx/materials";
import { useUniformTime } from "../../fx/useUniformTime";
import { FONTS } from "../../tower/primitives";
import type { ExperienceData, GpuTier, RoofData } from "../../types";
import type { RoofActive, RoofLayout } from "./layout";
import { boxBuffers, boxEdgeBuffers, type Box } from "./solids";

/** RF accent (FLOOR_COLOR.RF) and the station tints. */
export const ROOF_BLUE = "#60a5fa";
export const ROOF_CYAN = "#22d3ee";
export const ROOF_VIOLET = "#a78bfa";

/** One neon hue per contact channel (decor only, never a brand mark). */
export const CHANNEL_TONE: Record<RoofData["channels"][number]["id"], string> = {
  linkedin: "#38bdf8",
  github: "#e5e7eb",
  huggingface: "#fbbf24",
  medium: "#34d399",
  googleScholar: "#60a5fa",
  ieeeXplore: "#22d3ee",
};

/** In-world strings (messages, resolved by Experience). */
export interface RoofLabels {
  comms: string;
  email: string;
  cvTitle: string;
  cvHint: string;
  about: string;
  availability: string;
}

/** What every roof scenery (concept) gets. */
export interface RoofSceneryProps {
  layout: RoofLayout;
  roof: RoofData;
  profile: ExperienceData["profile"];
  labels: RoofLabels;
  tier: GpuTier;
  reducedMotion: boolean;
  /** RF room open in the drawer: the scenery transmits (contact) or launches (cv). */
  active: RoofActive;
}

/** All the solid boxes of a scenery in one mesh (one draw call). */
export function MergedBoxes({ boxes, color, emissive = "#000000", emissiveIntensity = 0 }: { boxes: readonly Box[]; color: string; emissive?: string; emissiveIntensity?: number }) {
  const geometry = useMemo(() => {
    const { positions, normals, indices } = boxBuffers(boxes);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("normal", new BufferAttribute(normals, 3));
    g.setIndex(new BufferAttribute(indices, 1));
    return g;
  }, [boxes]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} roughness={0.7} metalness={0.2} />
    </mesh>
  );
}

/** Neon outlines of all the boxes in one line mesh (one draw call), boosted on the full tier so they bloom. */
export function MergedEdges({ boxes, color, tier, opacity = 0.85 }: { boxes: readonly Box[]; color: string; tier: GpuTier; opacity?: number }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(boxEdgeBuffers(boxes), 3));
    return g;
  }, [boxes]);
  const neon = useMemo(() => neonColor(color, 1.4, tier), [color, tier]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={neon} transparent opacity={opacity} toneMapped={false} />
    </lineSegments>
  );
}

export interface PulseSource {
  x: number;
  y: number;
  z: number;
  color: string;
  /** 0 to 1 offset in the pulse cycle (default: spread evenly). */
  phase?: number;
}

const PULSE_VS = `attribute vec3 aColor; attribute float aPhase;
uniform float uTime; uniform float uPulse; uniform float uSpeed; uniform float uGrow;
varying vec3 vColor; varying float vAlpha;
void main(){
  float k = mix(.35, fract(uTime*uSpeed + aPhase), uPulse);
  vColor = aColor; vAlpha = (1. - k)*mix(.6, 1., uPulse);
  vec3 p = position*(1. + k*uGrow);
  gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p, 1.);
}`;
const PULSE_FS = `varying vec3 vColor; varying float vAlpha; void main(){ gl_FragColor = vec4(vColor, vAlpha*.8);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/**
 * Flat signal rings that grow and fade from each source (one instanced draw call). Reduced motion
 * holds every ring still at a third of its growth; the lite tier blends normally instead of adding.
 */
export function PulseRings({ sources, radius = 0.6, grow = 4, speed = 0.5, tier, reducedMotion }: { sources: readonly PulseSource[]; radius?: number; grow?: number; speed?: number; tier: GpuTier; reducedMotion: boolean }) {
  const geometry = useMemo(() => {
    const g = new RingGeometry(radius, radius + 0.12, 40);
    g.rotateX(-Math.PI / 2);
    g.setAttribute("aColor", new InstancedBufferAttribute(new Float32Array(sources.flatMap((s) => new Color(s.color).toArray())), 3));
    g.setAttribute("aPhase", new InstancedBufferAttribute(new Float32Array(sources.map((s, i) => s.phase ?? i / Math.max(1, sources.length))), 1));
    return g;
  }, [sources, radius]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPulse: { value: reducedMotion ? 0 : 1 }, uSpeed: { value: speed }, uGrow: { value: grow } },
        vertexShader: PULSE_VS,
        fragmentShader: PULSE_FS,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: tier === "full" ? AdditiveBlending : NormalBlending,
      }),
    [reducedMotion, speed, grow, tier],
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
    sources.forEach((s, i) => {
      o.position.set(s.x, s.y, s.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [sources, geometry, material]);
  if (!sources.length) return null;
  return <instancedMesh ref={mesh} args={[geometry, material, sources.length]} frustumCulled={false} raycast={() => null} />;
}


/** The about card rows, top to bottom from `top`: eyebrow, name, headline, role, location and timezone, one-line intro. */
export function aboutCard(
  at: { x: number; z: number; top: number; yaw: number; width: number },
  profile: RoofSceneryProps["profile"],
  roof: RoofData,
  labels: RoofLabels,
): BatchedLabel[] {
  const row = (text: string, dy: number, font: string, fontSize: number, color: string, extra: Partial<BatchedLabel> = {}): BatchedLabel => ({
    text,
    position: [at.x, at.top - dy, at.z],
    yaw: at.yaw,
    font,
    fontSize,
    color,
    maxWidth: at.width,
    textAlign: "center",
    ...extra,
  });
  return [
    row(labels.about.toUpperCase(), 0, FONTS.mono, 0.16, ROOF_BLUE, { letterSpacing: 0.14 }),
    row(profile.name, 0.45, FONTS.sansBold, 0.4, "#f8fafc"),
    row(profile.headline, 1.0, FONTS.sans, 0.22, "#e0e7ff"),
    row(profile.role, 1.4, FONTS.mono, 0.15, "#c7d2fe"),
    row(`${profile.location} · ${roof.timezone}`, 1.75, FONTS.mono, 0.15, "#c7d2fe"),
    row(roof.subheadline, 2.2, FONTS.sans, 0.19, "#cbd5e1", { lineHeight: 1.25 }),
  ];
}
