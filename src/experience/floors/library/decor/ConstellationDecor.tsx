"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Matrix4, NormalBlending, Quaternion, ShaderMaterial, Vector3, type InstancedMesh, type Mesh } from "three";
import { neonColor } from "../../../fx/materials";
import { LineBatch } from "../../labs/lines";
import { LIBRARY_ZONES, ZONE_TONE, type LibraryZone } from "../model";
import { ResearchPapers, STATION_HEIGHT, StationLabels, StationShells, stationTitles, ZoneIcons, ZoneSigns, type DecorProps } from "./common";

/** Height of the star field over the floor. */
const SKY = 6.4;

const NEBULA_VS = `attribute vec3 aTint; varying vec2 vUv; varying vec3 vTint; void main(){ vUv = uv; vTint = aTint; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }`;
const NEBULA_FS = `uniform float uOpacity; varying vec2 vUv; varying vec3 vTint;
void main(){
  float d = length(vUv - .5)*2.;
  float a = uOpacity*smoothstep(1., .1, d)*(.7 + .3*sin(d*14.));
  gl_FragColor = vec4(vTint, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** One flat glow per zone on the floor (merged into one mesh). */
function Nebulae({ centers, tier }: { centers: Partial<Record<LibraryZone, { x: number; z: number }>>; tier: DecorProps["tier"] }) {
  const full = tier === "full";
  const geometry = useMemo(() => {
    const pos: number[] = [];
    const uv: number[] = [];
    const tint: number[] = [];
    const idx: number[] = [];
    const color = new Color();
    for (const zone of LIBRARY_ZONES) {
      const c = centers[zone];
      if (!c) continue;
      const r = 9;
      const base = pos.length / 3;
      color.set(ZONE_TONE[zone]);
      for (const [dx, dz, u, v] of [[-r, -r, 0, 0], [r, -r, 1, 0], [r, r, 1, 1], [-r, r, 0, 1]] as const) {
        pos.push(c.x + dx, 0.03, c.z + dz);
        uv.push(u, v);
        tint.push(color.r, color.g, color.b);
      }
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    g.setAttribute("aTint", new Float32BufferAttribute(tint, 3));
    g.setIndex(idx);
    return g;
  }, [centers]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uOpacity: { value: full ? 0.16 : 0.12 } },
        vertexShader: NEBULA_VS,
        fragmentShader: NEBULA_FS,
        transparent: true,
        depthWrite: false,
        blending: full ? AdditiveBlending : NormalBlending,
      }),
    [full],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return <mesh geometry={geometry} material={material} raycast={() => null} />;
}

/** A star (small octahedron) over every post station, twinkling unless reduced motion (one instanced mesh). */
function Stars({ points, tier, reducedMotion }: { points: { x: number; z: number }[]; tier: DecorProps["tier"]; reducedMotion: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const color = useMemo(() => neonColor(ZONE_TONE.blog, 1.8, tier), [tier]);
  const scratch = useMemo(() => ({ matrix: new Matrix4(), q: new Quaternion(), axis: new Vector3(0, 1, 0), at: new Vector3(), scale: new Vector3() }), []);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const { matrix, q, axis, at, scale } = scratch;
    points.forEach((p, i) => {
      const t = clock.elapsedTime;
      const s = reducedMotion ? 0.55 : 0.5 + 0.12 * Math.sin(t * 2.1 + i * 1.3);
      q.setFromAxisAngle(axis, reducedMotion ? 0 : t * 0.6 + i);
      matrix.compose(at.set(p.x, SKY, p.z), q, scale.set(s, s * 1.4, s));
      m.setMatrixAt(i, matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  if (!points.length) return null;
  return (
    <instancedMesh key={points.length} ref={mesh} args={[undefined, undefined, points.length]} frustumCulled={false} raycast={() => null}>
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  );
}

/** The star core over the core plaza: a slowly turning wire icosahedron. */
function Core({ at, tier, reducedMotion }: { at: { x: number; z: number }; tier: DecorProps["tier"]; reducedMotion: boolean }) {
  const ref = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current && !reducedMotion) ref.current.rotation.y += Math.min(dt, 0.1) * 0.25;
  });
  const color = useMemo(() => neonColor("#ffffff", 1.6, tier), [tier]);
  return (
    <mesh ref={ref} position={[at.x, 5.2, at.z]} raycast={() => null}>
      <icosahedronGeometry args={[2.6, 1]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={0.6} toneMapped={false} />
    </mesh>
  );
}

/**
 * Concept C, "Constellation": every post is a star above its station, joined to the posts that share a
 * tag by lines in the sky (and each star to its station by a thin beam); zones glow as nebulae on the floor.
 */
export function ConstellationDecor(props: DecorProps) {
  const { layout, library, tier, reducedMotion, zones, onStation } = props;
  const titles = useMemo(() => stationTitles(library, zones), [library, zones]);
  const posts = useMemo(() => layout.stations.filter((s) => s.zone === "blog"), [layout.stations]);
  const shelves = useMemo(() => layout.stations.filter((s) => s.zone !== "blog"), [layout.stations]);
  const lines = useMemo(() => {
    const batch = new LineBatch();
    const at = new Map(posts.map((s) => [s.room, s.center]));
    for (const [a, b] of layout.links) {
      const p = at.get(a);
      const q = at.get(b);
      if (p && q) batch.segment([p.x, SKY, p.z, q.x, SKY, q.z], ZONE_TONE.blog);
    }
    for (const s of posts) batch.segment([s.center.x, STATION_HEIGHT.blog, s.center.z, s.center.x, SKY - 0.6, s.center.z], "#64748b");
    return batch.build();
  }, [layout.links, posts]);
  useEffect(() => () => lines.dispose(), [lines]);
  const neon = useMemo(() => neonColor("#ffffff", 1.3, tier), [tier]);
  return (
    <group name="library-constellation">
      <StationShells stations={layout.stations} tier={tier} onStation={onStation} />
      <Nebulae centers={layout.extras.nebulae ?? {}} tier={tier} />
      <Stars points={posts.map((s) => s.center)} tier={tier} reducedMotion={reducedMotion} />
      <lineSegments geometry={lines} raycast={() => null}>
        <lineBasicMaterial color={neon} vertexColors transparent opacity={0.7} toneMapped={false} />
      </lineSegments>
      <Core at={layout.centerpiece} tier={tier} reducedMotion={reducedMotion} />
      <ZoneIcons stations={shelves} tier={tier} reducedMotion={reducedMotion} />
      <StationLabels stations={layout.stations} titles={titles} y={posts.length ? 4.6 : 5.2} />
      <ZoneSigns layout={layout} zones={zones} />
      <ResearchPapers layout={layout} library={library} tier={tier} onPaper={props.onPaper} />
    </group>
  );
}
