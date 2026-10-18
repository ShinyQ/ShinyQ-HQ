import { AdditiveBlending, Color, DataTexture, DoubleSide, NormalBlending, ShaderMaterial, Vector2, Vector3, Vector4 } from "three";

/**
 * One shader for the spectacle effects (floating sign plates, the L2 horizon, the L3 reactor and data
 * waterfalls, the RF observatory globe): `uMode` picks the pattern, so every effect shares one program (two with instancing)
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
  /**
   * Highlights Hall stage effects (L1 gallery): the kind comes per instance from `aStage.x` (`STAGE_KIND`
   * in floors/lobby/hallStage.ts: stage lights, light curtain and portal, stat tiles, atlas images and the
   * portrait hologram, pulse rings), so the hall shares this program instead of adding its own. Only this
   * mode reads `aStage`, `aStage2` and `aStageUv`; instance color carries the tint, `aStage2.w` the alpha.
   */
  stage: 9,
  /** Hologram globe body (L1 Visitor Observatory): a fresnel rim around the mesh origin and faint latitude lines. */
  globe: 10,
  /** Round dot on a quad (globe land and country dots): dimmed where it faces away from the mesh origin's viewer (`uParams.y` = back alpha), pulsing by `uParams.x`. */
  dot: 11,
  /** Day and night sky dome: `uColor * vTint` is the zenith, `uFill` the horizon, `uGlow` the sun glow, `uSun` the sun direction, `uParams.x` the horizon sine, `uParams.y` the star amount. */
  sky: 12,
  /** Sun and moon disc on a quad: instance color and `aAlpha`, `uParams.x` the disc radius, `uParams.y` the halo falloff, `uParams.z` the moon shadow offset (instance 1 only). */
  orb: 13,
} as const;

export type HoloMode = (typeof HOLO_MODE)[keyof typeof HOLO_MODE];

export const HOLO_VS = `attribute float aAlpha; attribute vec4 aStage; attribute vec4 aStage2; attribute vec4 aStageUv;
uniform int uMode; uniform float uTime; uniform vec2 uCenter; uniform float uSpin; uniform float uDrift; uniform float uPulse;
varying vec2 vUv; varying vec3 vW; varying vec3 vL; varying vec3 vTint; varying vec2 vSize; varying float vSeed; varying float vAlpha; varying float vDist;
varying vec4 vStage; varying vec2 vMapUv; varying vec2 vLocal; varying vec3 vC;
void main(){
  vUv = uv; vL = position; vTint = vec3(1.); vSeed = 0.; vAlpha = 1.; vSize = vec2(1.);
  vStage = vec4(0., 1., 0., 1.); vMapUv = uv; vLocal = vec2(0.);
  mat4 inst = mat4(1.);
#ifdef USE_INSTANCING
  inst = instanceMatrix; vSeed = float(gl_InstanceID); vAlpha = aAlpha;
  vSize = vec2(length(inst[0].xyz), length(inst[1].xyz));
#endif
#ifdef USE_INSTANCING_COLOR
  vTint = instanceColor;
#endif
  vec4 w = modelMatrix * inst * vec4(position, 1.);
  if (uMode == 9) {
    // Stage: instanceMatrix holds the instance's position and yaw (scale 1); the shape comes from aStage.
    float kind = aStage.x;
    vec3 base = inst[3].xyz;
    mat3 rot = mat3(inst);
    vec3 local;
    vStage = vec4(kind, aStage2.w, 0., 1.);
    if (kind < 2.5) {
      float t = position.y + .5;
      float h = aStage.y * mix(1., .8 + .2 * sin(uTime * 1.2 + aStage2.z * 6.2832), aStage2.x);
      float r = mix(aStage.z, aStage.w, t);
      if (aStage2.x > .5) {
        float a = uTime * uSpin; vec2 d = base.xz - uCenter; float c = cos(a); float s = sin(a);
        base.xz = uCenter + vec2(d.x * c + d.y * s, -d.x * s + d.y * c);
      }
      local = vec3(position.x * r, t * h, position.z * r);
      w = modelMatrix * vec4(base + local, 1.);
      vec3 n = normalize(mat3(modelMatrix) * vec3(position.x, 0., position.z));
      vStage.z = t;
      vStage.w = abs(dot(n, normalize(cameraPosition - w.xyz)));
    } else if (kind > 7.5) {
      float k = mix(.35, fract(uTime * aStage.z + aStage2.z), uPulse);
      vStage.z = k;
      w = modelMatrix * vec4(base + position * (1. + k * aStage.y), 1.);
    } else {
      float lift = (kind > 4.5 && kind < 5.5) ? uDrift * .08 * sin(uTime * .6 + aStage2.z) : 0.;
      local = vec3(position.x * aStage.y, position.y * aStage.z + lift, 0.);
      vLocal = (position.xy + .5) * aStage.yz; vSize = aStage.yz;
      vMapUv = vec2(mix(aStageUv.x, aStageUv.z, uv.x), mix(aStageUv.y, aStageUv.w, uv.y));
      w = modelMatrix * vec4(base + rot * local, 1.);
    }
  }
  vW = w.xyz;
  vC = (modelMatrix * vec4(0., 0., 0., 1.)).xyz;
  vec4 mv = viewMatrix * w;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

export const HOLO_FS = `uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform vec2 uFade; uniform int uMode; uniform vec4 uParams;
uniform sampler2D uMap; uniform float uLoaded; uniform float uProgress; uniform float uFlicker; uniform float uPulse; uniform vec3 uFill; uniform vec3 uSun; uniform vec3 uGlow;
varying vec2 vUv; varying vec3 vW; varying vec3 vL; varying vec3 vTint; varying vec2 vSize; varying float vSeed; varying float vAlpha; varying float vDist;
varying vec4 vStage; varying vec2 vMapUv; varying vec2 vLocal; varying vec3 vC;
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
  } else if (uMode == 8) {
    float y = abs(vUv.y - 0.5) * 2.;
    float edge = smoothstep(0.6, 0.95, y);
    float pulse = band(fract(vUv.x - uTime * 0.12 - hash(vSeed) ) - 0.5, 0.12);
    col = c * (edge * 1.2 + pulse * 1.2 + 0.1);
    a = edge * 0.7 + pulse * 0.6 + 0.06;
  } else if (uMode == 9) {
    // Stage (HOLO_MODE.stage): vStage = (kind, alpha, t or ring growth, view edge).
    float kind = vStage.x;
    col = c; a = vStage.y;
    if (kind < .5) {
      a *= (1. - vStage.z) * smoothstep(0., .08, vStage.z + .04) * smoothstep(.05, .7, vStage.w);
    } else if (kind < 1.5) {
      a *= mix(1., .35, vStage.z) * smoothstep(1., .8, vStage.z) * smoothstep(.05, .7, vStage.w);
    } else if (kind < 2.5) {
      float p = smoothstep(0., 1., vStage.z);
      a *= p * p;
    } else if (kind < 4.5) {
      float edge = smoothstep(0., .06, vUv.x) * smoothstep(1., .94, vUv.x);
      float lines = .75 + .25 * sin((vUv.y - uTime * .05) * 120.);
      float sweep = (vUv.y - (1. - uProgress)) * 9.;
      float k = kind < 3.5 ? exp(-sweep * sweep) * .9 + (1. - uProgress) * .18 : .06 + .3 * pow(max(1. - vUv.y, 0.), 1.6);
      a *= k * lines * edge;
    } else if (kind < 5.5) {
      vec2 d2 = min(vLocal, vSize - vLocal);
      float d = min(d2.x, d2.y);
      float line = 1. - smoothstep(.025, .05, d);
      float glow = (1. - smoothstep(.05, .3, d)) * .25;
      col = mix(uFill + c * glow, c, line);
    } else if (kind < 7.5) {
      vec3 img = uLoaded > .5 ? texture2D(uMap, vMapUv).rgb : uFill;
      if (kind > 6.5) {
        vec2 disc = vUv * 2. - 1.;
        float r = length(disc);
        if (r > 1.) discard;
        float scan = .86 + .14 * sin(disc.y * 90. - uTime * 2.);
        float flick = 1. - uFlicker * .08 * step(.93, fract(sin(floor(uTime * 9.) * 43.7) * 4375.85));
        img = mix(img, img * c, .35) * scan * flick + c * smoothstep(.8, 1., r) * .21;
      }
      col = img;
    } else {
      a *= (1. - vStage.z) * mix(.6, 1., uPulse) * .8;
    }
  } else if (uMode == 10) {
    vec3 n = normalize(vW - vC);
    float f = 1. - abs(dot(n, normalize(cameraPosition - vW)));
    float rim = f * f * f;
    float lat = fract(asin(clamp(n.y, -1., 1.)) * 1.9099 + 0.5) - 0.5;
    float grid = band(lat, 0.04) * 0.3;
    col = c * (rim * 1.4 + grid + 0.05);
    a = rim * 0.8 + grid * 0.6 + 0.05;
  } else if (uMode == 12) {
    vec3 d = normalize(vW - vC);
    float h = d.y - uParams.x;
    col = mix(uFill, c, smoothstep(0., h > 0. ? .3 : .25, abs(h)));
    if (uGlow.r + uGlow.g + uGlow.b > 0.) {
      float s = max(dot(d, uSun), 0.);
      float hug = exp(-h * h * 60.);
      col += uGlow * (pow(s, 6.) * (.2 + .6 * hug) + pow(s, 64.) * .5);
    }
    if (uParams.y > 0.) {
      vec2 sp = vec2(atan(d.z, d.x), asin(clamp(d.y, -1., 1.))) * 160.;
      vec2 cell = floor(sp);
      float r = hash(cell.x * 91.7 + cell.y * 13.3);
      vec2 at = vec2(hash(cell.x + cell.y * 7.1), hash(cell.y + cell.x * 3.9));
      float star = step(.985, r) * (1. - smoothstep(.06, .16, length(fract(sp) - at)));
      float tw = .65 + .35 * sin(uTime * (1. + 2. * r) + r * 40.);
      col += vec3(.85, .9, 1.) * star * tw * uParams.y * smoothstep(-.05, .2, h + .3);
    }
    a = 1.;
  } else if (uMode == 13) {
    vec2 p = vUv * 2. - 1.;
    float r = length(p);
    float disc = 1. - smoothstep(uParams.x - .02, uParams.x, r);
    if (vSeed > .5) disc *= mix(1., .18, 1. - smoothstep(uParams.x - .02, uParams.x, length(p - vec2(uParams.z, uParams.z * .3))));
    float halo = exp(-r * r * uParams.y) * (1. - smoothstep(.7, 1., r));
    col = c * (disc * 1.4 + halo * .45);
    a = (disc + halo * .5) * vAlpha;
  } else {
    float r = length(vUv - 0.5) * 2.;
    float d = 1. - smoothstep(0.5, 1., r);
    float core = 1. - smoothstep(0., 0.45, r);
    float front = smoothstep(-0.2, 0.3, dot(normalize(vW - vC), normalize(cameraPosition - vW)));
    float pulse = 1. + uParams.x * 0.4 * sin(uTime * 2.2 + vSeed * 1.7);
    col = c * (d * 0.7 + core * 0.8) * pulse;
    a = d * mix(uParams.y, 1., front);
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

/** A 1 x 1 white map: the stage mode's sampler is always bound (`uLoaded` 0 draws `uFill` instead). */
export const BLANK_MAP = (() => {
  const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

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
      // Stage mode only (the L1 Highlights Hall); every material carries them so the program stays one.
      uCenter: { value: new Vector2() },
      uSpin: { value: 0 },
      uDrift: { value: 0 },
      uPulse: { value: 1 },
      uProgress: { value: 0 },
      uFlicker: { value: 0 },
      uLoaded: { value: 0 },
      uMap: { value: BLANK_MAP },
      uFill: { value: new Color("#0b1020") },
      // Sky and orb modes: the sun direction and the premultiplied sun glow (both unused by other modes).
      uSun: { value: new Vector3(0, 1, 0) },
      uGlow: { value: new Color(0, 0, 0) },
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
