import { AdditiveBlending, DoubleSide, ShaderMaterial } from "three";

/**
 * The hall interiors' one program (owner budget 2026-11-04: at most one new program): every interior effect is an
 * instanced quad with a `mode` (`PREMIUM_MODE`), so each hall part draws its interiors in one call. Attributes per
 * instance: `aA` (mode, width, height, station 1 to 7 or 0), `aB` (tilt, spin rad/s, phase, alpha), `aC` (grow with the
 * wake, ripple cycles/s, orientation (tokens: their orbit radius), mode value); the instance matrix holds position and yaw, the instance colour the
 * tint (path: a floor line with a travelling pulse, `aC.w` its phase; pool: a soft radial glow; rings take `aC.x` as
 * their band, 0.06 by default). `uWake` holds each station's wake level, `uT` the clock (frozen under reduced motion), `uFull` 0 on lite.
 */
export const PREMIUM_MODE = { pane: 0, shimmer: 1, curtain: 2, bar: 3, cone: 4, ring: 5, token: 6, path: 7, pool: 8 } as const;
/** Orientation (`aC.z`): upright on the instance's yaw, lying on the floor, or turned to the camera around the vertical. */
export const ORIENT = { upright: 0, lying: 1, column: 2 } as const;

const VS = `attribute vec4 aA; attribute vec4 aB; attribute vec4 aC;
uniform float uT; uniform float uWake[7];
varying vec2 vUv; varying vec2 vL; varying vec2 vS; varying vec3 vCol; varying float vM; varying float vA; varying float vW; varying float vF; varying float vX; varying float vG;
void main(){
  float m = aA.x; vec2 s = aA.yz; int si = int(aA.w + .5);
  float wk = 1.;
  for (int i = 0; i < 7; i++) if (i + 1 == si) wk = uWake[i];
  vW = wk; vUv = uv; vM = m; vCol = instanceColor; vA = aB.w; vX = aC.w; vF = 0.; vG = aC.x;
  vec3 base = instanceMatrix[3].xyz; mat3 rot = mat3(instanceMatrix);
  vec2 q = position.xy;
  if (aC.x > .5) q.x = (q.x + .5) * mix(.02, 1., wk) - .5;
  if (aC.y > 0.) { vF = fract(uT * aC.y + aB.z); s *= .15 + .85 * vF; }
  vL = (q + .5) * s; vS = s;
  vec3 wp;
  if (m > 5.5 && m < 6.5) {
    float ang = aB.z + uT * aB.y;
    vec3 c = vec3(cos(ang), 0., sin(ang)) * aC.z;
    c = vec3(c.x, -c.z * sin(aB.x), c.z * cos(aB.x));
    vec3 cw = (modelMatrix * vec4(base + rot * c, 1.)).xyz;
    vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    wp = cw + (cr * q.x + cu * q.y) * s.x;
    vF = fract(ang / 6.2832 - uT * .1);
  } else {
    vec3 p = vec3(q * s, 0.);
    if (aC.z > .5 && aC.z < 1.5) p = vec3(p.x, 0., -p.y);
    float c1 = cos(aB.x); float s1 = sin(aB.x);
    p = vec3(p.x, p.y * c1 - p.z * s1, p.y * s1 + p.z * c1);
    float g = uT * aB.y + (aB.y != 0. ? aB.z : 0.); float c2 = cos(g); float s2 = sin(g);
    p = vec3(p.x * c2 + p.z * s2, p.y, p.z * c2 - p.x * s2);
    if (aC.z > 1.5) {
      vec3 b0 = (modelMatrix * vec4(base, 1.)).xyz;
      vec3 d = cameraPosition - b0;
      wp = b0 + normalize(vec3(d.z, 0., -d.x) + 1e-5) * p.x + vec3(0., p.y, 0.);
    } else wp = (modelMatrix * vec4(base + rot * p, 1.)).xyz;
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`;

const FS = `uniform float uT; uniform float uFull;
varying vec2 vUv; varying vec2 vL; varying vec2 vS; varying vec3 vCol; varying float vM; varying float vA; varying float vW; varying float vF; varying float vX; varying float vG;
float rim(float w){ vec2 d = min(vL, vS - vL); return 1. - smoothstep(w, w * 2.2, min(d.x, d.y)); }
void main(){
  vec3 c = vCol; float a = vA; float m = vM; float wk = vW; vec2 uv = vUv;
  if (m < .5) {
    a *= rim(.025) * mix(.4, 1., wk) + vX * (.6 + .4 * wk);
  } else if (m < 1.5) {
    vec2 p = (uv - .5) * vS;
    float run = smoothstep(.88, 1., fract(atan(p.y, p.x) / 6.2832 - uT * .15));
    float dy = (uv.y - fract(uT * .2)) * 9.;
    float band = exp(-dy * dy) * .3 * uFull;
    a *= rim(.025) * (.35 + 1.6 * run) * mix(.5, 1., wk) + band * wk;
  } else if (m < 2.5) {
    float lines = .8 + .2 * sin((uv.y - uT * .04) * 140.);
    a *= (.06 + .55 * pow(max(1. - uv.y, 0.), 1.6)) * lines * smoothstep(0., .1, uv.x) * smoothstep(1., .9, uv.x) * mix(.45, 1., wk);
  } else if (m < 3.5) {
    a *= smoothstep(0., .3, min(uv.y, 1. - uv.y)) * mix(.5, 1., wk);
  } else if (m < 4.5) {
    float h = mix(.5, .07, uv.y);
    a *= (1. - smoothstep(h * .5, h, abs(uv.x - .5))) * mix(.3, 1., uv.y) * smoothstep(1., .9, uv.y) * mix(.6, 1., wk);
  } else if (m < 5.5) {
    float r = length(uv * 2. - 1.);
    if (r > 1.) discard;
    float t = vG > 0. ? vG : .06;
    a *= ((1. - smoothstep(t * .5, t, abs(r - 1. + t))) + (1. - r) * vX) * mix(.5, 1., wk) * (vF > 0. ? 1. - vF : 1.);
  } else if (m > 6.5 && m < 7.5) {
    float d = uv.x - fract(uT * .18 + vX);
    a *= (1. - abs(uv.y * 2. - 1.)) * (.3 + 1.4 * exp(-d * d * 120.) * uFull) * mix(.6, 1., wk);
  } else if (m > 7.5) {
    float r = length(uv * 2. - 1.);
    if (r > 1.) discard;
    float k = 1. - r;
    a *= k * k * mix(.35, 1., wk);
  } else {
    float r = length(uv * 2. - 1.);
    float sweep = vX > .5 && vX < 1.5 ? smoothstep(.86, 1., vF) * 1.6 * uFull : 0.;
    float breathe = vX > 1.5 ? .55 + .45 * sin(uT * 2.4) : 1.;
    c *= 1. + sweep;
    a *= ((1. - smoothstep(.3, .5, r)) + (1. - smoothstep(.3, 1., r)) * .4) * breathe;
  }
  gl_FragColor = vec4(c, a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/** The interiors' material: additive, double sided, no depth write, no fog; `uWake` is shared by every part. */
export function createPremiumMaterial(wake: Float32Array, full: boolean): ShaderMaterial {
  return new ShaderMaterial({
    name: "hall-premium",
    uniforms: { uT: { value: 0 }, uWake: { value: wake }, uFull: { value: full ? 1 : 0 } },
    vertexShader: VS,
    fragmentShader: FS,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    fog: false,
  });
}
