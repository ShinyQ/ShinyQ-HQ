"use client";

import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, NormalBlending, ShaderMaterial } from "three";
import type { GpuTier } from "../types";
import { hexFrame, iconMesh, type IconStyle, type IconTone, type Stroke } from "./holoIcons";
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
  strokes: readonly Stroke[];
  instances: readonly HoloIconInstance[];
  style: IconStyle;
  tone: IconTone;
  /** Icon width in world units. */
  size?: number;
  tier: GpuTier;
  reducedMotion: boolean;
}

/**
 * Neon hologram icon (one per career type, or any stroke icon from holoIcons.ts), drawn for every
 * instance in one geometry and one material per layer: at most three draw calls per type
 * (icon, glow halo, badge frame). `line` is flat neon line art that sways toward the road, `badge`
 * adds a hexagon frame and a glass fill, `solid` extrudes thicker strokes. Reduced
 * motion holds every icon still; the lite tier drops the halo and the additive glow.
 */
export function HoloIcon({ strokes, instances, style, tone, size = 2.4, tier, reducedMotion }: HoloIconProps) {
  const full = tier === "full";
  // Icons sway toward the road instead of spinning: a flat icon seen edge-on is unreadable.
  const sway = reducedMotion ? 0 : 1;

  const layers = useMemo(() => {
    const out: { geometry: BufferGeometry; material: ShaderMaterial }[] = [];
    if (!instances.length) return out;
    // Solid icons take the type glow as their body color (a white core washes out without bloom).
    const strokeColor = neonColor(style === "solid" ? tone.glow : tone.stroke, full && style !== "solid" ? 1.6 : 1, tier);
    const glowColor = new Color(tone.glow);
    const main = iconMesh(strokes, { size, width: style === "solid" ? 2.2 : 1.5, depth: style === "solid" ? size * 0.12 : 0 });
    out.push({ geometry: instanced(main, instances), material: material(strokeColor, 0.95, full && style !== "solid", sway) });
    if (full) {
      // Soft halo: the same strokes, wider and faint, just behind the icon.
      const halo = iconMesh(strokes, { size, width: style === "solid" ? 5 : 4 });
      out.push({ geometry: instanced(halo, instances, style === "solid" ? -size * 0.07 : -0.02), material: material(glowColor, 0.16, true, sway) });
    }
    if (style === "badge") {
      const frame = iconMesh([hexFrame()], { size, width: 1.1 });
      out.push({ geometry: instanced(frame, instances), material: material(neonColor(tone.glow, 1.6, tier), 0.9, full, sway) });
      const fill = iconMesh([hexFrame(6.8)], { size, width: 13.6 });
      out.push({ geometry: instanced(fill, instances, -0.03), material: material(glowColor, 0.07, false, sway) });
    }
    return out;
  }, [strokes, instances, style, tone, size, tier, full, sway]);

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
    <group name={`holo-icon-${style}`}>
      {layers.map((l, i) => (
        <mesh key={i} geometry={l.geometry} material={l.material} frustumCulled={false} raycast={() => null} />
      ))}
    </group>
  );
}
