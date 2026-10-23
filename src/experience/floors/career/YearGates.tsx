"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferGeometry, Float32BufferAttribute, type Mesh } from "three";
import { getHQStore } from "@/store/useHQStore";
import { COLORS, FLOOR_COLOR } from "../../config";
import { BatchedLabels, type BatchedLabelsHandle } from "../../fx/BatchedLabels";
import { neonColor } from "../../fx/materials";
import { Readable } from "../../fx/Readable";
import { RoadMarkings } from "../../fx/RoadMarkings";
import { useDispose } from "../../fx/useDispose";
import { roverRuntime } from "../../rover/runtime";
import { FONTS } from "../../tower/primitives";
import type { GpuTier, Vec2 } from "../../types";
import { CAREER_ROAD, type CareerRoadLayout } from "./layout";
import { useMemberFade } from "./CareerRooms";
import { signpostSet } from "./labels";

const BAR = 0.5;

function boxEdges(pts: number[], a: Vec2, b: Vec2, y0: number, y1: number, half: number) {
  // A thin box from a to b (plan view), half-width `half`, between heights y0 and y1.
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const n = { x: (-dz / len) * half, z: (dx / len) * half };
  const t = { x: (dx / len) * half, z: (dz / len) * half };
  const corners = [
    { x: a.x - t.x - n.x, z: a.z - t.z - n.z },
    { x: a.x - t.x + n.x, z: a.z - t.z + n.z },
    { x: b.x + t.x + n.x, z: b.z + t.z + n.z },
    { x: b.x + t.x - n.x, z: b.z + t.z - n.z },
  ];
  for (const y of [y0, y1]) for (let i = 0; i < 4; i++) pts.push(corners[i].x, y, corners[i].z, corners[(i + 1) % 4].x, y, corners[(i + 1) % 4].z);
  for (const c of corners) pts.push(c.x, y0, c.z, c.x, y1, c.z);
}

/**
 * The Career Road itself: road, plaza and spur markings (RoadMarkings), a neon arch over the road
 * before every year plaza with the year in large digits and a signpost ("2021 · 8 rooms"); the arch
 * digits are the only year marker (no floating year board, owner decision). All arches share one line
 * geometry; crossing an arch pulses its year once (not under reduced motion). Texts turn around when the camera is behind them (`Readable`).
 */
export function YearGates({
  layout,
  prologue,
  roomsLabel,
  tier,
  reducedMotion,
}: {
  layout: CareerRoadLayout;
  prologue: string | null;
  roomsLabel: (count: number) => string;
  tier: GpuTier;
  reducedMotion: boolean;
}) {
  const accent = FLOOR_COLOR.L2;
  const H = CAREER_ROAD.archHeight;
  const { years } = layout;

  const arches = useMemo(() => {
    const pts: number[] = [];
    const half = CAREER_ROAD.archPost / 2;
    for (const y of years) {
      const [a, b] = y.arch.posts;
      for (const p of [a, b]) boxEdges(pts, { x: p.x, z: p.z - half }, { x: p.x, z: p.z + half }, 0, H, half);
      boxEdges(pts, a, b, H, H + BAR, half);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return g;
  }, [years, H]);
  useDispose(arches);

  const neon = useMemo(() => neonColor(accent, 2, tier), [accent, tier]);
  const digits = useRef<(Mesh | null)[]>([]);
  const pulse = useRef({ lastX: Number.NaN, start: years.map(() => -1) });
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const p = pulse.current;
    const x = roverRuntime.x;
    const s = getHQStore().getState();
    years.forEach((y, i) => {
      const gate = y.arch.center.x;
      // Crossing an arch (either way) pulses its year once: scale 1 to 1.04 and back in 400 ms.
      if (s.floor === "L2" && !s.reducedMotion && !Number.isNaN(p.lastX) && (p.lastX - gate) * (x - gate) < 0) p.start[i] = t;
      const k = p.start[i] >= 0 ? (t - p.start[i]) / 0.4 : 1;
      digits.current[i]?.scale.setScalar(k < 1 ? 1 + 0.04 * Math.sin(Math.PI * k) : 1);
    });
    p.lastX = x;
  });

  // Signposts fade with distance like the room labels (the floor runs about 390 u).
  const signposts = useMemo(() => signpostSet(years, roomsLabel), [years, roomsLabel]);
  const signpostBatch = useRef<BatchedLabelsHandle>(null);
  useMemberFade(signpostBatch, signposts);

  return (
    <group name="year-gates">
      {/* Long plazas under bloom read as solid amber at the default fill: keep the full tier subtle. */}
      <RoadMarkings network={layout.network} color={accent} tier={tier} reducedMotion={reducedMotion} fillOpacity={tier === "full" ? 0.05 : 0.08} />
      <lineSegments geometry={arches} raycast={() => null}>
        <lineBasicMaterial color={neon} transparent opacity={0.9} toneMapped={false} />
      </lineSegments>
      {years.map((y, i) => (
        <Readable key={y.year} position={[y.arch.center.x, 0, y.arch.center.z]}>
          <Text
            ref={(node: Mesh | null) => {
              digits.current[i] = node;
            }}
            font={FONTS.monoBold}
            fontSize={2.2}
            letterSpacing={0.04}
            color={accent}
            anchorX="center"
            anchorY="bottom"
            position={[0, H + BAR + 0.3, 0]}
            material-toneMapped={false}
          >
            {String(y.year)}
          </Text>
        </Readable>
      ))}
      <BatchedLabels ref={signpostBatch} labels={signposts.labels} name="career-signposts" toneMapped exactColors />
      {prologue && years[0] && (
        <Readable position={[years[0].arch.center.x, H - 1, years[0].arch.center.z + CAREER_ROAD.width / 2 + 1.4]} pivot={[years[0].arch.center.x, years[0].arch.center.z]}>
          <Text font={FONTS.mono} fontSize={0.4} letterSpacing={0.08} color={COLORS.white} anchorX="center" anchorY="top" maxWidth={14} textAlign="center">
            {prologue}
          </Text>
        </Readable>
      )}
    </group>
  );
}
