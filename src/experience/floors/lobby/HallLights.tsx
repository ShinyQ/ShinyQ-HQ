"use client";

import { useMemo } from "react";
import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, NormalBlending, ShaderMaterial } from "three";
import { useDispose } from "../../fx/useDispose";
import { useUniformTime } from "../../fx/useUniformTime";
import type { GpuTier } from "../../types";
import { FOUNTAIN, type LightInstance } from "./hallGallery";

const KIND = { beam: 0, cone: 1, pool: 2 } as const;

const VS = `attribute vec3 aPos; attribute vec4 aShape; attribute vec4 aColor; attribute vec2 aAnim;
uniform float uTime; uniform vec2 uCenter; uniform float uSpin;
varying vec3 vColor; varying float vAlpha; varying float vT; varying float vEdge; varying float vKind;
void main(){
  float t = position.y + .5;
  float h = aShape.x * mix(1., .8 + .2*sin(uTime*1.2 + aAnim.y*6.2832), aAnim.x);
  float r = mix(aShape.y, aShape.z, t);
  vec3 base = aPos;
  if (aAnim.x > .5) {
    float a = uTime*uSpin;
    vec2 d = base.xz - uCenter;
    float c = cos(a); float s = sin(a);
    base.xz = uCenter + vec2(d.x*c + d.y*s, -d.x*s + d.y*c);
  }
  vec4 world = modelMatrix*vec4(base + vec3(position.x*r, t*h, position.z*r), 1.);
  vec3 n = normalize(mat3(modelMatrix)*vec3(position.x, 0., position.z));
  vEdge = abs(dot(n, normalize(cameraPosition - world.xyz)));
  vColor = aColor.rgb; vAlpha = aColor.a; vT = t; vKind = aShape.w;
  gl_Position = projectionMatrix*viewMatrix*world;
}`;

const FS = `uniform float uGain;
varying vec3 vColor; varying float vAlpha; varying float vT; varying float vEdge; varying float vKind;
void main(){
  float fade;
  if (vKind < .5) fade = (1. - vT)*smoothstep(0., .08, vT + .04);
  else if (vKind < 1.5) fade = mix(1., .35, vT)*smoothstep(1., .8, vT);
  else fade = smoothstep(0., 1., vT)*smoothstep(0., 1., vT);
  float soft = vKind > 1.5 ? 1. : smoothstep(.05, .7, vEdge);
  gl_FragColor = vec4(vColor, vAlpha*fade*soft*uGain);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Fake stage lighting for the Highlights Hall in one instanced draw call: spotlight cones from above,
 * uplight fans, the light fountain's beams (they turn slowly around the fountain and pulse in height)
 * and the glow pools on the floor. No real lights on any tier. The full tier adds them up (bloom
 * picks them up); the lite tier blends them normally and a little fainter. Reduced motion freezes
 * `uTime`, so the fountain stands still. A shader material: the ride cull never hides it.
 */
export function HallLights({ lights, tier }: { lights: readonly LightInstance[]; tier: GpuTier }) {
  const geometry = useMemo(() => {
    const unit = new CylinderGeometry(1, 1, 1, 20, 1, true);
    const g = new InstancedBufferGeometry();
    g.index = unit.index;
    g.setAttribute("position", unit.getAttribute("position"));
    g.setAttribute("aPos", new InstancedBufferAttribute(new Float32Array(lights.flatMap((l) => [l.x, l.y, l.z])), 3));
    g.setAttribute("aShape", new InstancedBufferAttribute(new Float32Array(lights.flatMap((l) => [l.h, l.r0, l.r1, KIND[l.kind]])), 4));
    g.setAttribute("aColor", new InstancedBufferAttribute(new Float32Array(lights.flatMap((l) => [...new Color(l.color).toArray(), l.alpha])), 4));
    g.setAttribute("aAnim", new InstancedBufferAttribute(new Float32Array(lights.flatMap((l) => [l.spin, l.phase])), 2));
    g.instanceCount = lights.length;
    unit.dispose();
    return g;
  }, [lights]);
  useDispose(geometry);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        name: "hall-lights",
        uniforms: { uTime: { value: 0 }, uCenter: { value: [FOUNTAIN.x, FOUNTAIN.z] }, uSpin: { value: FOUNTAIN.spin }, uGain: { value: tier === "full" ? 1 : 0.8 } },
        vertexShader: VS,
        fragmentShader: FS,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: tier === "full" ? AdditiveBlending : NormalBlending,
      }),
    [tier],
  );
  useDispose(material);
  const materials = useMemo(() => [material], [material]);
  useUniformTime(materials);
  if (!lights.length) return null;
  // The unit geometry's bounds do not cover the instances: never frustum culled.
  return <mesh name="hall-lights" geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />;
}
