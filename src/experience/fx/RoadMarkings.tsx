"use client";

import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute, NormalBlending, Object3D, ShaderMaterial, type InstancedMesh } from "three";
import type { RoadNetwork } from "../nav/road";
import { chevronMarks, networkFill, ribbon, roadEdges, spurStub, type Ribbon } from "../nav/roadGeometry";
import type { GpuTier } from "../types";
import { neonColor } from "./materials";
import { useUniformTime } from "./useUniformTime";

/** Lift above the slab so the markings never z-fight the grid floor. */
const Y = { fill: 0.025, stub: 0.035, edge: 0.045, chevron: 0.055 } as const;
const CHEVRON = { w: 2.2, d: 0.9, thickness: 0.32 } as const;
const PULSE_SPEED = 6;

function toGeometry(r: Ribbon, y: number, colors?: number[]): BufferGeometry {
  const g = new BufferGeometry();
  const positions: number[] = [];
  for (let i = 0; i < r.positions.length; i += 2) positions.push(r.positions[i], y, r.positions[i + 1]);
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new Float32BufferAttribute(r.uvs, 2));
  if (colors) g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  g.setIndex(r.indices);
  return g;
}

/** Flat "V" arrow pointing +z, two quads (one instanced draw call for every chevron on the floor). */
function chevronGeometry(): BufferGeometry {
  const { w, d, thickness: t } = CHEVRON;
  const tip = [0, d / 2];
  const pts: number[] = [];
  const idx: number[] = [];
  for (const side of [-1, 1]) {
    const end = [(side * w) / 2, -d / 2];
    const base = pts.length / 3;
    pts.push(end[0], 0, end[1], tip[0], 0, tip[1], tip[0], 0, tip[1] - t * 1.6, end[0], 0, end[1] - t);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pts, 3));
  g.setIndex(idx);
  return g;
}

const CHEVRON_VS = `attribute float aPhase; uniform float uTime; uniform float uPulse; varying float vGlow;
void main(){ float wave = pow(.5 + .5*sin(aPhase*.45 - uTime*${PULSE_SPEED.toFixed(1)}*.45), 6.);
  vGlow = mix(.55, .35 + .9*wave, uPulse);
  gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.); }`;
const CHEVRON_FS = `uniform vec3 uColor; varying float vGlow; void main(){ gl_FragColor = vec4(uColor*vGlow, min(1., vGlow)*.8);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

export interface RoadMarkingsProps {
  network: RoadNetwork;
  /** Floor accent (road tint and chevrons). */
  color: string;
  tier: GpuTier;
  reducedMotion: boolean;
  /** Spur stub color when a spur has none. */
  stubColor?: string;
  chevronSpacing?: number;
}

/**
 * Road markings for a walkable floor: the road, plaza and spur fill (one mesh), colored spur stubs
 * at the doors (one mesh), dashed edge lines (one line geometry) and forward chevrons (one instanced
 * mesh) with a pulse running forward. The lite tier and reduced motion drop the pulse; the lite
 * tier also drops the edge glow (no additive blending, dimmer lines).
 */
export function RoadMarkings({ network, color, tier, reducedMotion, stubColor = "#e5e7eb", chevronSpacing = 4 }: RoadMarkingsProps) {
  const full = tier === "full";
  const pulse = full && !reducedMotion;

  const fill = useMemo(() => toGeometry(networkFill(network), Y.fill), [network]);
  const stubs = useMemo(() => {
    const out: Ribbon = { positions: [], uvs: [], indices: [] };
    const colors: number[] = [];
    const c = new Color();
    for (const spur of network.spurs) {
      const stub = spurStub(spur);
      const before = out.positions.length / 2;
      ribbon([stub.from, stub.to], stub.width, false, out);
      c.set(spur.color ?? stubColor);
      for (let i = before; i < out.positions.length / 2; i++) colors.push(c.r, c.g, c.b);
    }
    return toGeometry(out, Y.stub, colors);
  }, [network, stubColor]);
  const edges = useMemo(() => {
    const pts: number[] = [];
    for (const [x1, z1, x2, z2] of roadEdges(network)) pts.push(x1, Y.edge, z1, x2, Y.edge, z2);
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return g;
  }, [network]);
  const marks = useMemo(() => chevronMarks(network, chevronSpacing), [network, chevronSpacing]);
  const chevron = useMemo(() => {
    const g = chevronGeometry();
    g.setAttribute("aPhase", new InstancedBufferAttribute(new Float32Array(marks.map((m) => m.s)), 1));
    return g;
  }, [marks]);
  const chevronMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPulse: { value: pulse ? 1 : 0 }, uColor: { value: neonColor(color, 1.6, tier) } },
        vertexShader: CHEVRON_VS,
        fragmentShader: CHEVRON_FS,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: full ? AdditiveBlending : NormalBlending,
      }),
    [color, tier, full, pulse],
  );
  const edgeColor = useMemo(() => neonColor(color, 1.4, tier), [color, tier]);

  useEffect(
    () => () => {
      fill.dispose();
      stubs.dispose();
      edges.dispose();
      chevron.dispose();
      chevronMaterial.dispose();
    },
    [fill, stubs, edges, chevron, chevronMaterial],
  );

  // uPulse is 0 on the lite tier and under reduced motion, so the clock only matters on the full tier.
  const clocked = useMemo(() => [chevronMaterial], [chevronMaterial]);
  useUniformTime(clocked);

  const placeChevrons = (mesh: InstancedMesh | null) => {
    if (!mesh) return;
    const d = new Object3D();
    marks.forEach((m, i) => {
      d.position.set(m.x, Y.chevron, m.z);
      d.rotation.set(0, m.angle, 0);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  return (
    <group name="road-markings">
      <mesh geometry={fill} raycast={() => null}>
        <meshBasicMaterial color={color} transparent opacity={full ? 0.11 : 0.09} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
      {network.spurs.length > 0 && (
        <mesh geometry={stubs} raycast={() => null}>
          <meshBasicMaterial vertexColors transparent opacity={0.5} depthWrite={false} toneMapped={false} side={DoubleSide} />
        </mesh>
      )}
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial color={edgeColor} transparent opacity={full ? 0.75 : 0.4} depthWrite={false} toneMapped={false} blending={full ? AdditiveBlending : NormalBlending} />
      </lineSegments>
      {marks.length > 0 && (
        <instancedMesh key={marks.length} ref={placeChevrons} args={[chevron, chevronMaterial, marks.length]} raycast={() => null} frustumCulled={false} />
      )}
    </group>
  );
}
