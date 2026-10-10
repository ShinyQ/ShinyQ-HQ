import { AdditiveBlending, Color, DoubleSide, ShaderMaterial, Vector2 } from "three";
import type { GpuTier } from "../types";

/** Shader factories ported from the v0 prototype (docs/prototypes/agent-hq-v0.html). */

const END = "\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}";

const GLASS_VS =
  "varying vec3 vN; varying vec3 vV; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }";
const GLASS_FS =
  `uniform vec3 uColor; uniform float uTime; uniform float uOp; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){ float f = pow(1.-abs(dot(normalize(vN),normalize(vV))), 2.2);
  float top = smoothstep(.86,1.,vUv.y), base = 1.-smoothstep(0.,.12,vUv.y);
  float scan = 1.-smoothstep(0.,.03,abs(fract(vUv.y*.7 - uTime*.12)-.5));
  float a = uOp + f*.16 + top*.16 + base*.08 + scan*.04;
  gl_FragColor = vec4(uColor*(.22 + f*.8 + top*1.1 + base*.5), a);` + END;

/** Tinted glass wall: fresnel edges, bright top band, base band and a slow moving scanline. */
export function createGlassMaterial(color: string, opacity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uTime: { value: 0 }, uOp: { value: opacity } },
    vertexShader: GLASS_VS,
    fragmentShader: GLASS_FS,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

const GLASS_INSTANCED_VS =
  "varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vTint; void main(){ vUv = uv; vTint = vec3(1.); mat4 inst = mat4(1.); \n#ifdef USE_INSTANCING\n inst = instanceMatrix; \n#endif\n#ifdef USE_INSTANCING_COLOR\n vTint = instanceColor; \n#endif\n vec4 mv = modelViewMatrix*inst*vec4(position,1.); vN = normalize(normalMatrix*mat3(inst)*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }";

/** The glass shader for instanced meshes: each instance is tinted by its instance color. */
export function createInstancedGlassMaterial(opacity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color("#ffffff") }, uTime: { value: 0 }, uOp: { value: opacity } },
    vertexShader: GLASS_INSTANCED_VS,
    fragmentShader: "varying vec3 vTint;\n" + GLASS_FS.replace("gl_FragColor = vec4(uColor*", "gl_FragColor = vec4(uColor*vTint*"),
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

/** Anti-aliased 1 u and 5 u grid in world space with a radial fade around `center`. */
export function createGridFloorMaterial({ line, bg, radius, center = [0, 0] }: { line: string; bg: string; radius: number; center?: [number, number] }): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uBg: { value: new Color(bg) },
      uLine: { value: new Color(line) },
      uRadius: { value: radius },
      uCenter: { value: new Vector2(center[0], center[1]) },
    },
    vertexShader:
      "varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }",
    fragmentShader:
      `uniform vec3 uBg; uniform vec3 uLine; uniform float uRadius; uniform vec2 uCenter; varying vec2 vW;
float grid(vec2 p){ vec2 g = abs(fract(p-.5)-.5)/fwidth(p); return 1.-min(min(g.x,g.y),1.); }
void main(){ float l1 = grid(vW), l5 = grid(vW/5.); float d = length(vW-uCenter)/uRadius; float fade = 1.-smoothstep(.45,1.,d);
  vec3 c = uBg + uLine*(l1*.07 + l5*.2)*fade + vec3(.012,.012,.03)*(1.-min(d,1.)); gl_FragColor = vec4(c,1.);` + END,
  });
}

/** Data lane: two edge lines plus dashes flowing along the strip (additive). */
export function createLaneMaterial(color: string, length: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLen: { value: length }, uColor: { value: new Color(color) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader:
      `uniform vec3 uColor; uniform float uTime; uniform float uLen; varying vec2 vUv;
void main(){ float y = abs(vUv.y-.5); float edge = smoothstep(.28,.44,y)*(1.-smoothstep(.44,.5,y));
  float dash = step(.55, fract(vUv.x*uLen*.5 - uTime*.9)) * (1.-smoothstep(.06,.14,y));
  float a = edge*.7 + dash*.45 + .05; gl_FragColor = vec4(uColor*a*1.8, a);` + END,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

/** Neon color: pushed above 1.0 on the full tier so only neon crosses the bloom threshold. */
export function neonColor(hex: string, k: number, tier: GpuTier): Color {
  return new Color(hex).multiplyScalar(tier === "full" ? k : 1);
}
