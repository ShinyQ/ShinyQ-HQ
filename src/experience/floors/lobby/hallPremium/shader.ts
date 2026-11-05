import { AdditiveBlending, DoubleSide, ShaderMaterial } from "three";
import { BLANK_MAP } from "../../../fx/holoFx";

/**
 * The hall interiors' one program (owner budget 2026-11-04: at most one new program): every interior effect is an
 * instanced quad with a `mode` (`PREMIUM_MODE`), so each hall part draws its interiors in one call. Attributes per
 * instance: `aA` (mode, width, height, station 1 to 7 or 0), `aB` (tilt, spin rad/s, phase, alpha), `aC` (bars: the width
 * they grow from with the wake; rings: their band; ripple cycles/s; orientation or a token's orbit radius; mode value),
 * `aD` (particles: their scatter offset; screens: the first cell's u, the cell width, the cell count and the start cell, cycling
 * every 6 s; rings and pools: 1 in `w` opens them with the wake); particles with `aC.y` over 0 take their colour from the
 * atlas at `aC.xy`. The instance
 * matrix holds position and yaw, the instance colour the tint. Modes: pane (bevelled glass frame, corner brackets,
 * scanlined fill), shimmer, curtain, bar, ring (dashed when the value is negative), token (orbit dot; gold flares, `2`
 * breathes), path (a line with a travelling pulse), pool, particle (assembles on the wake), screen (an atlas image that
 * floats forward on the wake), trophy (an outline drawn in light). `uWake` holds each station's wake, `uT` the clock
 * (frozen under reduced motion), `uFull` 0 on lite, `uMap` the hall's screenshot atlas.
 */
export const PREMIUM_MODE = { pane: 0, shimmer: 1, curtain: 2, bar: 3, ring: 5, token: 6, path: 7, pool: 8, particle: 9, screen: 10, trophy: 11 } as const;
/** Orientation (`aC.z`): upright on the instance's yaw, lying on the floor, or turned to the camera around the vertical. */
export const ORIENT = { upright: 0, lying: 1, column: 2 } as const;

const VS = `attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; attribute vec4 aD;
uniform float uT; uniform float uWake[7];
varying vec2 vUv; varying vec2 vL; varying vec2 vS; varying vec3 vCol; varying float vM; varying float vA; varying float vW; varying float vF; varying float vX; varying float vG; varying vec4 vR; varying vec2 vT;
void main(){
  float m = aA.x; vec2 s = aA.yz; int si = int(aA.w + .5);
  float wk = 1.;
  for (int i = 0; i < 7; i++) if (i + 1 == si) wk = uWake[i];
  float ez = wk * wk * (3. - 2. * wk);
  vW = wk; vUv = uv; vM = m; vCol = instanceColor; vA = aB.w; vX = aC.w; vF = 0.; vG = aC.x; vR = aD; vT = aC.xy;
  vec3 base = instanceMatrix[3].xyz; mat3 rot = mat3(instanceMatrix);
  vec2 q = position.xy;
  bool ring = m > 4.5 && m < 5.5;
  if (m > 2.5 && m < 3.5 && aC.x > 0.) q.x = (q.x + .5) * mix(aC.x, 1., ez) - .5;
  if (ring && aC.y > 0.) { vF = fract(uT * aC.y + aB.z); s *= .15 + .85 * vF; }
  if ((ring || (m > 7.5 && m < 8.5)) && aD.w > .5) s *= mix(.05, 1., ez);
  vL = (q + .5) * s; vS = s;
  vec3 wp;
  if ((m > 5.5 && m < 6.5) || (m > 8.5 && m < 9.5)) {
    vec3 c = aD.xyz * (1. - ez);
    if (m < 7.) {
      float ang = aB.z + uT * aB.y;
      c = vec3(cos(ang), 0., sin(ang)) * aC.z;
      c = vec3(c.x, -c.z * sin(aB.x), c.z * cos(aB.x));
      vF = fract(ang / 6.2832 - uT * .1);
    }
    vec3 cw = (modelMatrix * vec4(base + rot * c, 1.)).xyz;
    wp = cw + (vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]) * q.x + vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]) * q.y) * s.x;
  } else {
    vec3 p = vec3(q * s, 0.);
    if (aC.z > .5 && aC.z < 1.5) p = vec3(p.x, 0., -p.y);
    if ((m > 9.5 && m < 10.5) || (m > .5 && m < 1.5)) p.z += aC.y * ez;
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

const FS = `uniform float uT; uniform float uFull; uniform sampler2D uMap; uniform float uMapOn;
varying vec2 vUv; varying vec2 vL; varying vec2 vS; varying vec3 vCol; varying float vM; varying float vA; varying float vW; varying float vF; varying float vX; varying float vG; varying vec4 vR; varying vec2 vT;
float rim(float w){ vec2 d = min(vL, vS - vL); return 1. - smoothstep(w, w * 2.2, min(d.x, d.y)); }
void main(){
  vec3 c = vCol; float a = vA; float m = vM; float wk = vW; vec2 uv = vUv; vec2 p = uv * 2. - 1.; float r = length(p);
  if (m < .5) {
    vec2 d = min(vL, vS - vL);
    float e = min(d.x, d.y);
    float frame = 1. - smoothstep(.02, .045, e) + (1. - smoothstep(0., .02, abs(e - .14))) * .4 + (1. - smoothstep(.03, .07, e)) * step(max(d.x, d.y), .6) * 1.2;
    a *= frame * mix(.4, 1., wk) + vX * (.75 + .25 * sin(vL.y * 60. - uT * 2.)) * (.6 + .4 * wk);
  } else if (m < 1.5) {
    vec2 q = (uv - .5) * vS;
    float run = smoothstep(.88, 1., fract(atan(q.y, q.x) / 6.2832 - uT * .15));
    float dy = (uv.y - fract(uT * .2)) * 9.;
    a *= rim(.025) * (.35 + 1.6 * run) * mix(.5, 1., wk) + exp(-dy * dy) * .3 * uFull * wk;
  } else if (m < 2.5) {
    a *= (.06 + .55 * pow(max(1. - uv.y, 0.), 1.6)) * (.8 + .2 * sin((uv.y - uT * .04) * 140.)) * smoothstep(0., .1, uv.x) * smoothstep(1., .9, uv.x) * mix(.45, 1., wk);
  } else if (m < 3.5) {
    a *= smoothstep(0., .3, min(uv.y, 1. - uv.y)) * mix(.5, 1., wk);
  } else if (m < 5.5) {
    if (r > 1.) discard;
    float t = vG > 0. ? vG : .06;
    float band = 1. - smoothstep(t * .5, t, abs(r - 1. + t));
    if (vX < 0.) band *= step(.5, fract(atan(p.y, p.x) * 3.8197 + uT * .1));
    a *= (band + (1. - r) * max(vX, 0.)) * mix(.5, 1., wk) * (vF > 0. ? 1. - vF : 1.);
  } else if (m < 6.5) {
    float gold = vX > .5 && vX < 1.5 ? 1. : 0.;
    float star = gold + (vX > 2.5 ? .4 : 0.);
    float flare = (1. - smoothstep(0., .1, abs(p.x))) * (1. - abs(p.y)) + (1. - smoothstep(0., .1, abs(p.y))) * (1. - abs(p.x));
    float sweep = gold * smoothstep(.86, 1., vF) * 1.6 * uFull;
    c *= 1. + sweep;
    a *= ((1. - smoothstep(.3, .5, r)) + (1. - smoothstep(.3, 1., r)) * .4 + star * flare * (.35 + sweep)) * (vX > 1.5 && vX < 2.5 ? .55 + .45 * sin(uT * 2.4) : 1.);
  } else if (m < 7.5) {
    bool x = vS.x >= vS.y;
    float d = (x ? uv.x : uv.y) - fract(uT * .18 + vX);
    a *= (1. - abs((x ? uv.y : uv.x) * 2. - 1.)) * (.3 + 1.4 * exp(-d * d * 120.) * uFull) * mix(.6, 1., wk);
  } else if (m < 8.5) {
    if (r > 1.) discard;
    a *= (1. - r) * (1. - r) * mix(.35, 1., wk);
  } else if (m < 9.5) {
    a *= 1. - smoothstep(.35, 1., r);
    if (vT.y > 0.) c = (uMapOn > .5 ? texture2D(uMap, vT).rgb * vec3(.75, .95, 1.15) : c * .5) * (1.25 - .25 * wk);
  } else if (m < 10.5) {
    float idx = mod(floor(uT / 6. + vR.w), max(vR.z, 1.));
    vec3 img = uMapOn > .5 ? texture2D(uMap, vec2(vR.x + (idx + uv.x) * vR.y, uv.y)).rgb : vec3(.04, .03, .1);
    c = img * (.85 + .15 * sin(uv.y * 220. - uT * 3.)) * mix(.55, 1., wk) + c * rim(.03);
  } else {
    vec2 q = vL - vS * .5;
    float cup = q.y > .6 ? 9. : abs(length((q - vec2(0., .6)) / vec2(1.1, 1.3)) - 1.) * 1.1;
    float lip = abs(q.y - .6) + max(abs(q.x) - 1.1, 0.);
    float hand = abs(q.x) < 1.1 ? 9. : abs(length(vec2(abs(q.x) - 1.15, q.y - .25)) - .42);
    float stem = q.y < -.7 && q.y > -1.22 ? abs(abs(q.x) - .14) : 9.;
    vec2 b = abs(q - vec2(0., -1.38)) - vec2(.75, .16);
    float foot = abs(length(max(b, 0.)) + min(max(b.x, b.y), 0.));
    float d = min(min(min(cup, lip), min(hand, stem)), foot);
    a *= (1. - smoothstep(.02, .06, d)) * mix(.5, 1., wk) * (.85 + .15 * sin(uT * 1.5));
  }
  gl_FragColor = vec4(c, a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/** The interiors' material: additive, double sided, no depth write, no fog; `uWake` is shared by every part. */
export function createPremiumMaterial(wake: Float32Array, full: boolean): ShaderMaterial {
  return new ShaderMaterial({
    name: "hall-premium",
    uniforms: { uT: { value: 0 }, uWake: { value: wake }, uFull: { value: full ? 1 : 0 }, uMap: { value: BLANK_MAP }, uMapOn: { value: 0 } },
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
