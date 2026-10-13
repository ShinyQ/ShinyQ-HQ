import { Color } from "three";
import { neonColor } from "../../fx/materials";
import type { GpuTier, Vec2 } from "../../types";
import type { AtlasCell, ShotQuad } from "./hallContent";
import { ARCH, experienceArch, gateOpening, onFace, type LightInstance, type StatTile } from "./hallGallery";
import { HALL } from "./hallLayout";

/**
 * One shader program for every Highlights Hall effect (owner budget: at most +2 programs per tier):
 * the stage lights (spotlight cones, uplights, the fountain beams, glow pools), the gateway light
 * curtain and the experience portal, the stat tile plates, the screenshots and the portrait hologram,
 * and the beacon's pulse rings. Each effect is an instance with a `kind`, drawn on an
 * `InstancedBufferGeometry` (one draw call per base shape and blend mode). Every material is a
 * `ShaderMaterial` with the same source, side, transparency and tone mapping, so three builds one
 * program per output color space; blending, depth writes and uniform values are GL state, not program
 * keys. Pure (Vitest builds the instances in node).
 */
export const STAGE_KIND = {
  beam: 0,
  cone: 1,
  pool: 2,
  curtain: 3,
  portal: 4,
  tile: 5,
  image: 6,
  portrait: 7,
  ring: 8,
} as const;

export type StageKind = (typeof STAGE_KIND)[keyof typeof STAGE_KIND];

/** One instance: `p` (x, y, z, kind), `s` shape, `r` (right.x, right.z, phase, spare), `c` color and alpha, `u` atlas uv rect. */
export interface StageInstance {
  p: [number, number, number, number];
  s: [number, number, number, number];
  r: [number, number, number, number];
  c: [number, number, number, number];
  u: [number, number, number, number];
}

const rgb = (c: Color): [number, number, number] => [c.r, c.g, c.b];
const ZERO4: [number, number, number, number] = [0, 0, 0, 0];

/** Lights on the unit open cylinder: `s` = (height, bottom radius, top radius, spin); lite draws them a little fainter. */
export function lightInstances(lights: readonly LightInstance[], tier: GpuTier): StageInstance[] {
  const gain = tier === "full" ? 1 : 0.8;
  return lights.map((l) => ({
    p: [l.x, l.y, l.z, STAGE_KIND[l.kind]],
    s: [l.h, l.r0, l.r1, l.spin],
    r: [0, 0, l.phase, 0],
    c: [...rgb(new Color(l.color)), l.alpha * gain],
    u: ZERO4,
  }));
}

/** A vertical plane centered on `center`, `w` along `right` and `h` tall. */
function plane(kind: StageKind, center: readonly [number, number, number], right: Vec2, w: number, h: number, color: [number, number, number], alpha: number, phase = 0, uv: [number, number, number, number] = [0, 0, 1, 1]): StageInstance {
  return { p: [center[0], center[1], center[2], kind], s: [w, h, 0, 0], r: [right.x, right.z, phase, 0], c: [...color, alpha], u: uv };
}

/** The gateway arch's light curtain, filling the opening (it sweeps through `uProgress`). */
export function curtainInstance(tier: GpuTier): StageInstance {
  const o = gateOpening();
  return plane(STAGE_KIND.curtain, [o.x, o.top / 2, (o.minZ + o.maxZ) / 2], { x: 0, z: 1 }, o.maxZ - o.minZ, o.top, rgb(neonColor(HALL.tone.about, 1.2, tier)), tier === "full" ? 1 : 0.85);
}

/** The work experience arch's lit opening. */
export function portalInstance(tier: GpuTier): StageInstance {
  const arch = experienceArch();
  return plane(STAGE_KIND.portal, onFace(arch.face, 0, ARCH.h / 2, -ARCH.depth / 2), arch.face.right, arch.opening.w, arch.opening.h, rgb(neonColor(HALL.tone.experience, 1.2, tier)), tier === "full" ? 1 : 0.85);
}

/** Stat tile plates (neon rim in the hall's accent), screenshots and the portrait hologram (atlas cells). */
export function panelInstances(tiles: readonly StatTile[], shots: readonly ShotQuad[], photo: ShotQuad, cells: readonly AtlasCell[], tier: GpuTier): StageInstance[] {
  const width = Math.max(1, ...cells.map((c) => c.x + c.w));
  const rect = (q: ShotQuad): [number, number, number, number] => {
    const cell = cells[q.index];
    return cell ? [cell.x / width, 0, (cell.x + cell.w) / width, 1] : [0, 0, 1, 1];
  };
  const line = rgb(neonColor(HALL.tone.about, 1.4, tier));
  return [
    ...tiles.map((t) => plane(STAGE_KIND.tile, onFace(t.face, 0, t.y, 0), t.face.right, t.w, t.h, line, 1, t.phase)),
    ...shots.map((q) => plane(STAGE_KIND.image, q.center, q.right, q.w, q.h, [1, 1, 1], 1, 0, rect(q))),
    plane(STAGE_KIND.portrait, photo.center, photo.right, photo.w, photo.h, rgb(new Color("#7dd3fc")), 1, 0, rect(photo)),
  ];
}

/** Pulse rings on the flat unit ring: `s` = (growth, speed). */
export function ringInstances(sources: readonly { x: number; y: number; z: number; phase: number }[], color: string, tier: GpuTier): StageInstance[] {
  const c = rgb(neonColor(color, 1, tier));
  return sources.map((p) => ({ p: [p.x, p.y, p.z, STAGE_KIND.ring], s: [5, 0.45, 0, 0], r: [0, 0, p.phase, 0], c: [...c, 1], u: ZERO4 }));
}

/** Instance attributes, one `Float32Array` per vec4 (`aP`, `aS`, `aR`, `aC`, `aU`). */
export function stageAttributes(list: readonly StageInstance[]): Record<"aP" | "aS" | "aR" | "aC" | "aU", Float32Array> {
  const pack = (key: keyof StageInstance) => new Float32Array(list.flatMap((i) => i[key]));
  return { aP: pack("p"), aS: pack("s"), aR: pack("r"), aC: pack("c"), aU: pack("u") };
}

export const STAGE_VS = `attribute vec4 aP; attribute vec4 aS; attribute vec4 aR; attribute vec4 aC; attribute vec4 aU;
uniform float uTime; uniform vec2 uCenter; uniform float uSpin; uniform float uDrift; uniform float uPulse;
varying vec4 vC; varying vec2 vUv; varying vec2 vMapUv; varying vec2 vLocal; varying vec2 vSize; varying float vT; varying float vEdge; varying float vKind; varying float vK;
void main(){
  float kind = aP.w;
  vKind = kind; vC = aC; vUv = uv; vMapUv = uv; vLocal = vec2(0.); vSize = vec2(1.); vT = 0.; vEdge = 1.; vK = 0.;
  vec3 w;
  if (kind < 2.5) {
    float t = position.y + .5;
    float h = aS.x*mix(1., .8 + .2*sin(uTime*1.2 + aR.z*6.2832), aS.w);
    float r = mix(aS.y, aS.z, t);
    vec3 base = aP.xyz;
    if (aS.w > .5) {
      float a = uTime*uSpin; vec2 d = base.xz - uCenter; float c = cos(a); float s = sin(a);
      base.xz = uCenter + vec2(d.x*c + d.y*s, -d.x*s + d.y*c);
    }
    w = base + vec3(position.x*r, t*h, position.z*r);
    vec3 n = normalize(mat3(modelMatrix)*vec3(position.x, 0., position.z));
    vEdge = abs(dot(n, normalize(cameraPosition - (modelMatrix*vec4(w, 1.)).xyz)));
    vT = t;
  } else if (kind > 7.5) {
    float k = mix(.35, fract(uTime*aS.y + aR.z), uPulse);
    vK = k;
    w = aP.xyz + position*(1. + k*aS.x);
  } else {
    vec3 right = vec3(aR.x, 0., aR.y);
    float lift = (kind > 4.5 && kind < 5.5) ? uDrift*.08*sin(uTime*.6 + aR.z) : 0.;
    w = aP.xyz + right*(position.x*aS.x) + vec3(0., position.y*aS.y + lift, 0.);
    vLocal = (position.xy + .5)*aS.xy; vSize = aS.xy;
    vMapUv = vec2(mix(aU.x, aU.z, uv.x), mix(aU.y, aU.w, uv.y));
  }
  gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(w, 1.);
}`;

export const STAGE_FS = `uniform sampler2D uMap; uniform float uLoaded; uniform float uTime; uniform float uProgress; uniform float uFlicker; uniform float uPulse; uniform vec3 uFill;
varying vec4 vC; varying vec2 vUv; varying vec2 vMapUv; varying vec2 vLocal; varying vec2 vSize; varying float vT; varying float vEdge; varying float vKind; varying float vK;
void main(){
  vec3 col = vC.rgb; float a = vC.a; bool raw = false;
  if (vKind < .5) {
    a *= (1. - vT)*smoothstep(0., .08, vT + .04)*smoothstep(.05, .7, vEdge);
  } else if (vKind < 1.5) {
    a *= mix(1., .35, vT)*smoothstep(1., .8, vT)*smoothstep(.05, .7, vEdge);
  } else if (vKind < 2.5) {
    a *= smoothstep(0., 1., vT)*smoothstep(0., 1., vT);
  } else if (vKind < 4.5) {
    float edge = smoothstep(0., .06, vUv.x)*smoothstep(1., .94, vUv.x);
    float lines = .75 + .25*sin((vUv.y - uTime*.05)*120.);
    float k = vKind < 3.5 ? exp(-pow((vUv.y - (1. - uProgress))*9., 2.))*.9 + (1. - uProgress)*.18 : .06 + .3*pow(1. - vUv.y, 1.6);
    a *= k*lines*edge;
  } else if (vKind < 5.5) {
    vec2 d2 = min(vLocal, vSize - vLocal);
    float d = min(d2.x, d2.y);
    float line = 1. - smoothstep(.025, .05, d);
    float glow = (1. - smoothstep(.05, .3, d))*.25;
    col = mix(uFill + vC.rgb*glow, vC.rgb, line);
    a = 1.;
  } else if (vKind < 7.5) {
    raw = true;
    vec3 c = uLoaded > .5 ? texture2D(uMap, vMapUv).rgb : uFill;
    if (vKind > 6.5) {
      vec2 disc = vUv*2. - 1.;
      float r = length(disc);
      if (r > 1.) discard;
      float scan = .86 + .14*sin(disc.y*90. - uTime*2.);
      float flick = 1. - uFlicker*.08*step(.93, fract(sin(floor(uTime*9.)*43.7)*4375.85));
      c = mix(c, c*vC.rgb, .35)*scan*flick + vC.rgb*smoothstep(.8, 1., r)*.21;
    }
    col = c; a = 1.;
  } else {
    a *= (1. - vK)*mix(.6, 1., uPulse)*.8;
  }
  gl_FragColor = vec4(col, a);
  vec3 untoned = gl_FragColor.rgb;
  #include <tonemapping_fragment>
  if (raw) gl_FragColor.rgb = untoned;
  #include <colorspace_fragment>
}`;
