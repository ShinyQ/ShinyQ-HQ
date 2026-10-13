import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector2, Vector4 } from "three";

/**
 * One shader for the spectacle effects (floating sign plates, the L2 horizon, the L3 reactor and data
 * waterfalls): `uMode` picks the pattern, so every effect shares one program (two with instancing)
 * instead of adding one per effect. Fog exempt with its own distance fade (`uFade`, near and far in u;
 * far 0 turns it off), so distant pieces read from the rail camera. Animated through `uTime` (frozen
 * under reduced motion by `useUniformTime`). Always a `ShaderMaterial`, so the ride cull never trusts
 * its bounds. Draw it on instanced meshes with an instance color only (`HoloMesh` for a single one), so
 * it compiles to exactly one program; plates read `aAlpha`.
 */
export const HOLO_MODE = {
  /** Dark sign backing with a neon rim (instance scale = plate size). */
  plate: 0,
  /** Holographic tower: glowing edges, window grid (instance scale = tower size), fading toward its base (`uParams.x` = world base y, `uParams.y` = fade height). */
  skyline: 1,
  /** Radial sunrise glow with a horizon band. */
  glow: 2,
  /** Light bridge: bright edges and dashes flowing along uv.x, fading toward the far end. */
  flow: 3,
  /** Light pillar: streaks rising along uv.y, fading toward the top. */
  pillar: 4,
  /** Data waterfall: columns of drops falling along uv.y, fading downward. */
  fall: 5,
  /** Reactor core column: bands rising along uv.y. */
  core: 6,
  /** Orbit ring: dashes running around the ring (planar ring geometry). */
  ring: 7,
  /** Glow strip on the floor: edges and a pulse running along uv.x. */
  strip: 8,
} as const;

export type HoloMode = (typeof HOLO_MODE)[keyof typeof HOLO_MODE];

export const HOLO_VS = `attribute float aAlpha;
varying vec2 vUv; varying vec3 vW; varying vec3 vL; varying vec3 vTint; varying vec2 vSize; varying float vSeed; varying float vAlpha; varying float vDist;
void main(){
  vUv = uv; vL = position; vTint = vec3(1.); vSeed = 0.; vAlpha = 1.; vSize = vec2(1.);
  mat4 inst = mat4(1.);
#ifdef USE_INSTANCING
  inst = instanceMatrix; vSeed = float(gl_InstanceID); vAlpha = aAlpha;
  vSize = vec2(length(inst[0].xyz), length(inst[1].xyz));
#endif
#ifdef USE_INSTANCING_COLOR
  vTint = instanceColor;
#endif
  vec4 w = modelMatrix * inst * vec4(position, 1.);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

export const HOLO_FS = `uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform vec2 uFade; uniform int uMode; uniform vec4 uParams;
varying vec2 vUv; varying vec3 vW; varying vec3 vL; varying vec3 vTint; varying vec2 vSize; varying float vSeed; varying float vAlpha; varying float vDist;
float hash(float n){ return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
float band(float x, float w){ return 1. - smoothstep(0., w, abs(x)); }
void main(){
  vec3 c = uColor * vTint;
  float fade = uFade.y > 0. ? 1. - smoothstep(uFade.x, uFade.y, vDist) : 1.;
  vec3 col = vec3(0.); float a = 0.;
  if (uMode == 0) {
    vec2 px = vUv * vSize;
    float edge = min(min(px.x, vSize.x - px.x), min(px.y, vSize.y - px.y));
    float rim = 1. - smoothstep(0.035, 0.075, edge);
    col = mix(vec3(0.02, 0.02, 0.047), c, rim);
    a = mix(0.9, 1., rim) * vAlpha;
  } else if (uMode == 1) {
    vec2 px = vUv * vSize;
    vec2 e = min(vUv, 1. - vUv) * vSize;
    float edge = 1. - smoothstep(0.5, 1.6, min(e.x, e.y));
    vec2 cell = floor(px / vec2(2.2, 2.6));
    vec2 f = fract(px / vec2(2.2, 2.6));
    float win = step(0.35, f.x) * step(f.x, 0.75) * step(0.4, f.y) * step(f.y, 0.7) * step(0.72, hash(cell.x * 13. + cell.y * 7. + vSeed * 3.));
    float flick = 0.75 + 0.25 * sin(uTime * 0.7 + hash(vSeed) * 6.28);
    float base = smoothstep(uParams.x, uParams.x + uParams.y, vW.y);
    col = c * (edge * 1.1 + win * 0.55 * flick + 0.05);
    a = (edge * 0.9 + win * 0.5 + 0.06) * base;
  } else if (uMode == 2) {
    vec2 p = vUv - 0.5;
    float r = length(p * vec2(1., 1.6)) * 2.;
    float core = exp(-r * r * 6.);
    float halo = exp(-r * r * 1.6);
    float horizon = band(p.y + 0.02, 0.03) * (1. - smoothstep(0.2, 0.5, abs(p.x)));
    col = mix(c, vec3(1., 0.8, 0.55) * length(c) * 0.6, core) * (halo * 0.5 + core * 0.6) + c * horizon;
    a = clamp(halo * 0.45 + core * 0.6 + horizon * 0.8, 0., 1.) * step(-0.02, p.y + 0.5 * core);
  } else if (uMode == 3) {
    float y = abs(vUv.y - 0.5) * 2.;
    float edge = smoothstep(0.78, 0.95, y);
    float dash = step(0.6, fract(vUv.x * uParams.x - uTime * 0.6)) * band(y, 0.25);
    float far = 1. - smoothstep(0.35, 1., vUv.x);
    col = c * (edge * 1.4 + dash * 0.9 + 0.12);
    a = (edge * 0.9 + dash * 0.6 + 0.08) * far;
  } else if (uMode == 4) {
    float col0 = floor(vUv.x * 28.);
    float s = fract(vUv.y * 3. - uTime * (0.18 + 0.2 * hash(col0)) + hash(col0 + 9.));
    float streak = smoothstep(0.75, 1., s) * step(0.4, hash(col0 + 3.));
    float top = 1. - smoothstep(0.35, 1., vUv.y);
    col = c * (streak * 1.5 + 0.18);
    a = (streak * 0.8 + 0.12) * top;
  } else if (uMode == 5) {
    float cols = uParams.x;
    float k = floor(vUv.x * cols);
    float speed = 0.35 + 0.5 * hash(k + vSeed * 17.);
    float s = fract((1. - vUv.y) * uParams.y - uTime * speed + hash(k * 3.1 + vSeed));
    float drop = smoothstep(0.55, 1., s) * step(0.25, hash(k * 1.7 + vSeed * 5.));
    float lane = band(fract(vUv.x * cols) - 0.5, 0.3);
    float lip = smoothstep(0.9, 1., vUv.y);
    float down = smoothstep(0., 0.9, vUv.y);
    col = c * (drop * lane * 1.8 + lane * 0.15 + lip * 0.8);
    a = (drop * lane + lane * 0.08 + lip * 0.6) * down;
  } else if (uMode == 6) {
    float b = fract(vUv.y * 6. - uTime * 0.25);
    float bands = smoothstep(0.7, 1., b) + 0.5 * band(vUv.y - 0.5, 0.5);
    float seam = 0.6 + 0.4 * sin(vUv.x * 6.2832 * 3. + uTime * 0.4);
    float top = 1. - smoothstep(0.7, 1., vUv.y);
    col = c * (bands * 1.4 * seam + 0.5);
    a = (bands * 0.8 + 0.4) * top;
  } else if (uMode == 7) {
    float ang = atan(vL.y, vL.x) / 6.2832 + 0.5;
    float dash = smoothstep(0.35, 0.5, abs(fract(ang * uParams.x + uTime * 0.08 * (mod(vSeed, 2.) * 2. - 1.)) - 0.5) * 2.);
    col = c * (0.35 + dash * 1.2);
    a = 0.25 + dash * 0.65;
  } else {
    float y = abs(vUv.y - 0.5) * 2.;
    float edge = smoothstep(0.6, 0.95, y);
    float pulse = band(fract(vUv.x - uTime * 0.12 - hash(vSeed) ) - 0.5, 0.12);
    col = c * (edge * 1.2 + pulse * 1.2 + 0.1);
    a = edge * 0.7 + pulse * 0.6 + 0.06;
  }
  gl_FragColor = vec4(col, a * uOpacity * fade);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

export interface HoloMaterialOptions {
  mode: HoloMode;
  color?: string | Color;
  opacity?: number;
  /** Additive (glow) or normal blending (plates, solid towers). Default additive except plates. */
  additive?: boolean;
  /** Distance fade [near, far] in u from the camera; omitted means none. */
  fade?: [number, number];
  /** Mode parameters (see `HOLO_MODE`). */
  params?: [number, number, number, number];
  /** Draw order hint for transparent passes. */
  depthWrite?: boolean;
}

/** A material for one effect; every material shares the `HOLO_VS`/`HOLO_FS` program. */
export function createHoloMaterial(o: HoloMaterialOptions): ShaderMaterial {
  const additive = o.additive ?? o.mode !== HOLO_MODE.plate;
  return new ShaderMaterial({
    name: "holo-fx",
    uniforms: {
      uMode: { value: o.mode },
      uColor: { value: o.color instanceof Color ? o.color.clone() : new Color(o.color ?? "#ffffff") },
      uOpacity: { value: o.opacity ?? 1 },
      uTime: { value: 0 },
      uFade: { value: new Vector2(o.fade?.[0] ?? 0, o.fade?.[1] ?? 0) },
      uParams: { value: new Vector4(...(o.params ?? [0, 0, 0, 0])) },
    },
    vertexShader: HOLO_VS,
    fragmentShader: HOLO_FS,
    transparent: true,
    depthWrite: o.depthWrite ?? false,
    blending: additive ? AdditiveBlending : NormalBlending,
    // One program for every effect: always double sided (plates face the camera anyway) and always instanced (`HoloMesh` for single meshes).
    side: DoubleSide,
    toneMapped: false,
    fog: false,
  });
}
