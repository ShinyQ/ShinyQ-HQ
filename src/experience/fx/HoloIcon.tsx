"use client";

import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, NormalBlending, ShaderMaterial } from "three";
import type { GpuTier } from "../types";
import { iconMesh, type Stroke } from "./holoIcons";
import { neonColor } from "./materials";
import { useUniformTime } from "./useUniformTime";

/** Where one icon floats: center (world, floor-local) and the yaw its face looks toward (forward is (sin, cos)). */
export interface HoloIconInstance {
  x: number;
  y: number;
  z: number;
  face: number;
}

const VS = `attribute vec3 aCenter; attribute float aFace; attribute float aPhase;
uniform float uTime; uniform float uSway;
void main(){
  float a = aFace + uSway*.45*sin(uTime*.8 + aPhase);
  float c = cos(a), s = sin(a);
  vec3 p = position;
  vec3 r = vec3(p.x*c + p.z*s, p.y + uSway*.12*sin(uTime*1.3 + aPhase), -p.x*s + p.z*c);
  gl_Position = projectionMatrix*modelViewMatrix*vec4(aCenter + r, 1.);
}`;
const FS = `uniform vec3 uColor; uniform float uOpacity; void main(){ gl_FragColor = vec4(uColor, uOpacity);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/** Copies one icon mesh per instance into one geometry with per-vertex center, yaw and phase. */
function instanced(mesh: { positions: number[]; indices: number[] }, instances: readonly HoloIconInstance[], zOffset = 0): BufferGeometry {
  const positions: number[] = [];
  const centers: number[] = [];
  const faces: number[] = [];
  const phases: number[] = [];
  const indices: number[] = [];
  const count = mesh.positions.length / 3;
  instances.forEach((inst, n) => {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      positions.push(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2] + zOffset);
      centers.push(inst.x, inst.y, inst.z);
      faces.push(inst.face);
      phases.push(n * 1.7);
    }
    for (const idx of mesh.indices) indices.push(idx + n * count);
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("aCenter", new Float32BufferAttribute(centers, 3));
  g.setAttribute("aFace", new Float32BufferAttribute(faces, 1));
  g.setAttribute("aPhase", new Float32BufferAttribute(phases, 1));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

function material(color: Color, opacity: number, additive: boolean, sway: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSway: { value: sway }, uColor: { value: color }, uOpacity: { value: opacity } },
    vertexShader: VS,
    fragmentShader: FS,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
}

export interface HoloIconProps {
  /** Line art from holoIcons.ts (for example `CAREER_ICONS.job`). */
  strokes: readonly Stroke[];
  instances: readonly HoloIconInstance[];
  /** Neon color (for career types, `CAREER_TONE[type]`). */
  color: string;
  /** Icon width in world units. */
  size?: number;
  tier: GpuTier;
  reducedMotion: boolean;
}

/**
 * Neon line hologram icon ("Neon line" direction): flat line art that sways toward the road, drawn
 * for every instance in one geometry, so a type costs one draw call (two on the full tier, which adds
 * a soft halo). Reduced motion holds every icon still; the lite tier drops the halo and the
 * additive glow.
 */
export function HoloIcon({ strokes, instances, color, size = 3.4, tier, reducedMotion }: HoloIconProps) {
  const full = tier === "full";
  const sway = reducedMotion ? 0 : 1;

  const layers = useMemo(() => {
    const out: { geometry: BufferGeometry; material: ShaderMaterial }[] = [];
    if (!instances.length) return out;
    out.push({ geometry: instanced(iconMesh(strokes, { size, width: 1.5 }), instances), material: material(neonColor(color, full ? 1.6 : 1, tier), 0.95, full, sway) });
    // Soft halo: the same strokes, wider and faint, just behind the icon.
    if (full) out.push({ geometry: instanced(iconMesh(strokes, { size, width: 4 }), instances, -0.02), material: material(new Color(color), 0.16, true, sway) });
    return out;
  }, [strokes, instances, color, size, tier, full, sway]);

  const materials = useMemo(() => layers.map((l) => l.material), [layers]);
  useUniformTime(materials);
  useEffect(
    () => () => {
      for (const l of layers) {
        l.geometry.dispose();
        l.material.dispose();
      }
    },
    [layers],
  );

  return (
    <group name="holo-icon">
      {layers.map((l, i) => (
        <mesh key={i} geometry={l.geometry} material={l.material} frustumCulled={false} raycast={() => null} />
      ))}
    </group>
  );
}
