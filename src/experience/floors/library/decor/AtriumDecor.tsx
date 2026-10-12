"use client";

import { Text } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, NormalBlending, ShaderMaterial } from "three";
import { useUniformTime } from "../../../fx/useUniformTime";
import { FONTS } from "../../../tower/primitives";
import { ZONE_TONE } from "../model";
import { faceRoad, ResearchPapers, STATION_HEIGHT, StationLabels, StationShells, stationTitles, ZoneIcons, ZoneSigns, type DecorProps } from "./common";
import { bookBuffers, type BookInstance } from "./flipBooks";

// The turning page follows `turnAngle` in flipBooks.ts (same smoothstep over an 8 s cycle).
const VS = `attribute vec3 aCenter; attribute float aFace; attribute float aSize; attribute float aPhase; attribute float aAngle;
uniform float uTime; uniform float uMotion;
varying vec2 vUv;
void main(){
  vUv = vec2(position.x, position.y + .5);
  float cyc = fract(uTime/8. + aPhase);
  float k = clamp((cyc - .3)/.4, 0., 1.);
  float turn = uMotion > .5 ? k*k*(3. - 2.*k)*3.14159 : 1.5708;
  float ang = aAngle < 0. ? turn : aAngle;
  ang += aAngle < 0. ? sin(position.x*3.14159)*.18*sin(turn) : 0.;
  vec3 p = vec3(cos(ang)*position.x*.75, position.y, sin(ang)*position.x*.75)*aSize;
  float c = cos(aFace), s = sin(aFace);
  vec3 r = vec3(p.x*c + p.z*s, p.y, -p.x*s + p.z*c);
  gl_Position = projectionMatrix*modelViewMatrix*vec4(aCenter + r, 1.);
}`;
const FS = `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
void main(){
  float edge = step(vUv.x, .04) + step(.96, vUv.x) + step(vUv.y, .03) + step(.97, vUv.y);
  float line = step(.55, fract(vUv.y*9.))*step(.18, vUv.x)*step(vUv.x, .86)*step(.12, vUv.y)*step(vUv.y, .82);
  float a = uOpacity*(.22 + .55*min(1., edge) + .25*line);
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Every open book on the floor in one geometry and one draw call (pages turn unless reduced motion). */
export function FlipBooks({ books, color, tier, reducedMotion }: { books: readonly BookInstance[]; color: string; tier: DecorProps["tier"]; reducedMotion: boolean }) {
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

/**
 * Concept A, "Reading Room": alcoves along the loop, a small open book turning its pages above every
 * post alcove, and a large book over the atrium with the newest post's title under it.
 */
export function AtriumDecor(props: DecorProps) {
  const { layout, library, tier, reducedMotion, zones, onStation } = props;
  const titles = useMemo(() => stationTitles(library, zones), [library, zones]);
  const books = useMemo<BookInstance[]>(() => {
    const posts = layout.stations.filter((s) => s.zone === "blog");
    return [
      ...posts.map((s, i) => ({ x: s.center.x, y: STATION_HEIGHT.blog + 1.6, z: s.center.z, face: faceRoad(s), size: 1.6, phase: i * 0.17 })),
      { x: layout.centerpiece.x, y: 4.2, z: layout.centerpiece.z, face: -Math.PI / 4, size: 5, phase: 0 },
    ];
  }, [layout]);
  const newest = library.posts.find((p) => !p.url);
  const shelves = useMemo(() => layout.stations.filter((s) => s.zone !== "blog"), [layout.stations]);
  return (
    <group name="library-atrium">
      <StationShells stations={layout.stations} tier={tier} onStation={onStation} />
      <FlipBooks books={books} color={ZONE_TONE.blog} tier={tier} reducedMotion={reducedMotion} />
      <ZoneIcons stations={shelves} tier={tier} reducedMotion={reducedMotion} />
      <StationLabels stations={layout.stations} titles={titles} />
      <ZoneSigns layout={layout} zones={zones} />
      <ResearchPapers layout={layout} library={library} tier={tier} onPaper={props.onPaper} />
      {newest && (
        <Text
          font={FONTS.sansBold}
          fontSize={0.7}
          maxWidth={12}
          textAlign="center"
          anchorX="center"
          anchorY="top"
          position={[layout.centerpiece.x, 1.2, layout.centerpiece.z + 3]}
          rotation={[-Math.PI / 2, 0, 0]}
          color={ZONE_TONE.blog}
          material-toneMapped={false}
        >
          {newest.title}
        </Text>
      )}
    </group>
  );
}
