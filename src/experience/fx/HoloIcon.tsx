"use client";

import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, NormalBlending, ShaderMaterial } from "three";
import type { GpuTier } from "../types";
import { iconMesh, type IconMesh, type Stroke } from "./holoIcons";
import { neonColor } from "./materials";
import { useUniformTime } from "./useUniformTime";

/**
 * Where one icon floats: center (world, floor-local) and the yaw its face looks toward (forward is (sin, cos)).
 * `strokes`, `color` and `size` override the component's defaults, so one geometry can carry many icons (batched mode).
 */
export interface HoloIconInstance {
  x: number;
  y: number;
  z: number;
  face: number;
  strokes?: readonly Stroke[];
  color?: string;
  size?: number;
}

// Compact GLSL (it ships as a string). Seen from behind (the camera turns all the way around), the icon turns half a
// turn so it never reads mirrored; it sways by `uSway` and takes its hue from `aColor` times the `uColor` boost.
const VS = `attribute vec3 aCenter;attribute float aFace;attribute float aPhase;attribute vec3 aColor;uniform float uTime;uniform float uSway;varying vec3 vC;
void main(){vC=aColor;
vec3 wc=(modelMatrix*vec4(aCenter,1.)).xyz;
float a=aFace+(dot(vec2(sin(aFace),cos(aFace)),cameraPosition.xz-wc.xz)<0.?3.14159265:0.)+uSway*.45*sin(uTime*.8+aPhase);
float c=cos(a),s=sin(a);vec3 p=position;
gl_Position=projectionMatrix*modelViewMatrix*vec4(aCenter+vec3(p.x*c+p.z*s,p.y+uSway*.12*sin(uTime*1.3+aPhase),-p.x*s+p.z*c),1.);}`;
const FS = `uniform vec3 uColor;uniform float uOpacity;uniform float uFade;varying vec3 vC;void main(){gl_FragColor=vec4(uColor*vC,uOpacity*uFade);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/**
 * Copies each instance's icon mesh (scaled to its size) into one geometry with per-vertex center, yaw, phase and color
 * (linear `aColor`; `uColor` carries the tier boost), so any mix of icons and hues costs one draw call.
 */
export function instanced(instances: readonly HoloIconInstance[], strokes: readonly Stroke[], color: string, size: number, width: number, z = 0): BufferGeometry {
  const positions: number[] = [];
  const centers: number[] = [];
  const faces: number[] = [];
  const phases: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const meshes = new Map<readonly Stroke[], IconMesh>();
  const c = new Color();
  instances.forEach((inst, n) => {
    const own = inst.strokes ?? strokes;
    let mesh = meshes.get(own);
    if (!mesh) meshes.set(own, (mesh = iconMesh(own, width)));
    const k = inst.size ?? size;
    const base = positions.length / 3;
    c.set(inst.color ?? color);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      positions.push(mesh.positions[i] * k, mesh.positions[i + 1] * k, z);
      centers.push(inst.x, inst.y, inst.z);
      faces.push(inst.face);
      phases.push(n * 1.7);
      colors.push(c.r, c.g, c.b);
    }
    for (const idx of mesh.indices) indices.push(idx + base);
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("aCenter", new Float32BufferAttribute(centers, 3));
  g.setAttribute("aFace", new Float32BufferAttribute(faces, 1));
  g.setAttribute("aPhase", new Float32BufferAttribute(phases, 1));
  g.setAttribute("aColor", new Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/** Full opacity for icons that never fade. */
const SOLID = { value: 1 };

function material(color: Color, opacity: number, additive: boolean, sway: number, fade: { value: number }): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSway: { value: sway }, uColor: { value: color }, uOpacity: { value: opacity }, uFade: fade },
    vertexShader: VS,
    fragmentShader: FS,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
}

export interface HoloIconProps {
  /** Line art from holoIcons.ts (for example `CAREER_ICONS.job`) for instances without their own `strokes`. */
  strokes?: readonly Stroke[];
  instances: readonly HoloIconInstance[];
  /** Neon color (for career types, `CAREER_TONE[type]`) for instances without their own `color`. */
  color?: string;
  /** Icon width in world units. */
  size?: number;
  tier: GpuTier;
  reducedMotion: boolean;
  /** Crossfade weight (0 to 1) as a shared uniform, read at every draw: the unique shapes fade in while the fallback fades out (`fx/shapes.ts`). */
  fade?: { value: number };
}

/**
 * Neon line hologram icon ("Neon line" direction): flat line art that sways toward the road and turns
 * around when the camera is behind it (so it never reads mirrored), drawn
 * for every instance in one geometry, so a batch costs one draw call (two on the full tier, which adds
 * a soft halo), whatever mix of icons and colors it holds. Every user shares one shader source (the `aColor`
 * attribute is always there), so batching adds no program. Reduced motion holds every icon still; the lite tier
 * drops the halo and the additive glow.
 */
export function HoloIcon({ strokes = [], instances, color = "#ffffff", size = 3.4, tier, reducedMotion, fade = SOLID }: HoloIconProps) {
  const full = tier === "full";
  const sway = reducedMotion ? 0 : 1;

  const layers = useMemo(() => {
    const out: { geometry: BufferGeometry; material: ShaderMaterial }[] = [];
    if (!instances.length) return out;
    out.push({ geometry: instanced(instances, strokes, color, size, 1.5), material: material(neonColor("#ffffff", 1.6, tier), 0.95, full, sway, fade) });
    // Soft halo: the same strokes, wider and faint, just behind the icon.
    if (full) out.push({ geometry: instanced(instances, strokes, color, size, 4, -0.02), material: material(new Color(1, 1, 1), 0.16, true, sway, fade) });
    return out;
  }, [strokes, instances, color, size, tier, full, sway, fade]);

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
