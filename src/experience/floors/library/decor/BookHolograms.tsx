"use client";

import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, NormalBlending, ShaderMaterial } from "three";
import { useUniformTime } from "../../../fx/useUniformTime";
import type { GpuTier } from "../../../types";
import { bookBuffers, type BookInstance } from "./flipBooks";

// The turning page follows `turnAngle` in flipBooks.ts (same smoothstep over an 8 s cycle). The GLSL is written
// without spaces: the strings ship as they are in the L4 chunk.
const VS = `attribute vec3 aCenter;attribute float aFace;attribute float aSize;attribute float aPhase;attribute float aAngle;
uniform float uTime;uniform float uMotion;
varying vec2 vUv;
void main(){
vUv=vec2(position.x,position.y+.5);
float cyc=fract(uTime/8.+aPhase);
float k=clamp((cyc-.3)/.4,0.,1.);
float turn=uMotion>.5?k*k*(3.-2.*k)*3.14159:1.5708;
float ang=aAngle<0.?turn:aAngle;
ang+=aAngle<0.?sin(position.x*3.14159)*.18*sin(turn):0.;
vec3 p=vec3(cos(ang)*position.x*.75,position.y,sin(ang)*position.x*.75)*aSize;
float c=cos(aFace),s=sin(aFace);
vec3 r=vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);
gl_Position=projectionMatrix*modelViewMatrix*vec4(aCenter+r,1.);
}`;
const FS = `uniform vec3 uColor;uniform float uOpacity;varying vec2 vUv;
void main(){
float edge=step(vUv.x,.04)+step(.96,vUv.x)+step(vUv.y,.03)+step(.97,vUv.y);
float line=step(.55,fract(vUv.y*9.))*step(.18,vUv.x)*step(vUv.x,.86)*step(.12,vUv.y)*step(vUv.y,.82);
float a=uOpacity*(.22+.55*min(1.,edge)+.25*line);
gl_FragColor=vec4(uColor,a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/** Every open book on the floor in one geometry and one draw call (pages turn unless reduced motion). */
export function FlipBooks({ books, color, tier, reducedMotion }: { books: readonly BookInstance[]; color: string; tier: GpuTier; reducedMotion: boolean }) {
  const full = tier === "full";
  const geometry = useMemo(() => {
    const b = bookBuffers(books);
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(b.positions, 3));
    g.setAttribute("aCenter", new Float32BufferAttribute(b.centers, 3));
    g.setAttribute("aFace", new Float32BufferAttribute(b.faces, 1));
    g.setAttribute("aSize", new Float32BufferAttribute(b.sizes, 1));
    g.setAttribute("aPhase", new Float32BufferAttribute(b.phases, 1));
    g.setAttribute("aAngle", new Float32BufferAttribute(b.angles, 1));
    g.setIndex(b.indices);
    return g;
  }, [books]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uMotion: { value: reducedMotion ? 0 : 1 }, uColor: { value: new Color(color).multiplyScalar(full ? 1.5 : 1) }, uOpacity: { value: full ? 0.9 : 0.75 } },
        vertexShader: VS,
        fragmentShader: FS,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: full ? AdditiveBlending : NormalBlending,
      }),
    [color, full, reducedMotion],
  );
  const list = useMemo(() => [material], [material]);
  useUniformTime(list);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return <mesh geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />;
}
