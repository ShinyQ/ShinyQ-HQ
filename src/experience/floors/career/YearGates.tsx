"use client";

import { Text } from "@react-three/drei";
import { useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { COLORS, FLOOR_COLOR } from "../../config";
import { FONTS, GlassBox } from "../../tower/primitives";
import { CORRIDOR, type CorridorLayout } from "./layout";

const GATE_H = 4.8;

function boxEdges(pts: number[], cx: number, cy: number, cz: number, w: number, h: number, d: number) {
  const x = [cx - w / 2, cx + w / 2];
  const y = [cy - h / 2, cy + h / 2];
  const z = [cz - d / 2, cz + d / 2];
  const corners = (i: number, j: number, k: number) => [x[i], y[j], z[k]];
  const edges: [number[], number[]][] = [];
  for (const j of [0, 1]) for (const k of [0, 1]) edges.push([corners(0, j, k), corners(1, j, k)]);
  for (const i of [0, 1]) for (const k of [0, 1]) edges.push([corners(i, 0, k), corners(i, 1, k)]);
  for (const i of [0, 1]) for (const j of [0, 1]) edges.push([corners(i, j, 0), corners(i, j, 1)]);
  for (const [a, b] of edges) pts.push(...a, ...b);
}

/**
 * Glowing corridor strip with year ticks, and a gate arch at the start of every year segment
 * showing the year in large mono digits. All arches share one line geometry.
 */
export function YearGates({ corridor, prologue }: { corridor: CorridorLayout; prologue: string | null }) {
  const accent = FLOOR_COLOR.L2;
  const { segments, endX } = corridor;
  const length = endX - CORRIDOR.startX;
  const z = CORRIDOR.halfWidth + CORRIDOR.gatePost;

  const arches = useMemo(() => {
    const pts: number[] = [];
    for (const s of segments) {
      for (const side of [-1, 1]) boxEdges(pts, s.startX, GATE_H / 2, side * z, CORRIDOR.gatePost, GATE_H, CORRIDOR.gatePost);
      boxEdges(pts, s.startX, GATE_H + 0.3, 0, CORRIDOR.gatePost, 0.6, 2 * z + CORRIDOR.gatePost);
      // Floor tick across the corridor.
      pts.push(s.startX, 0.06, -CORRIDOR.halfWidth, s.startX, 0.06, CORRIDOR.halfWidth);
    }
    // Center guide line along the corridor.
    pts.push(CORRIDOR.startX, 0.06, 0, endX, 0.06, 0);
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return g;
  }, [segments, endX, z]);

  return (
    <group name="year-gates">
      <GlassBox size={[length, 0.04, CORRIDOR.halfWidth * 2]} position={[CORRIDOR.startX + length / 2, 0.02, 0]} color={accent} fillOpacity={0.08} edgeOpacity={0.7} />
      <lineSegments geometry={arches}>
        <lineBasicMaterial color={accent} transparent opacity={0.9} toneMapped={false} />
      </lineSegments>
      {segments.map((s) => (
        <Text
          key={s.year}
          font={FONTS.monoBold}
          fontSize={2.2}
          letterSpacing={0.04}
          color={accent}
          anchorX="center"
          anchorY="bottom"
          position={[s.startX, GATE_H + 0.75, 0]}
          material-toneMapped={false}
        >
          {String(s.year)}
        </Text>
      ))}
      {prologue && segments[0] && (
        <Text
          font={FONTS.mono}
          fontSize={0.4}
          letterSpacing={0.08}
          color={COLORS.white}
          anchorX="center"
          anchorY="top"
          position={[segments[0].startX, GATE_H - 0.15, 0.4]}
          maxWidth={7}
          textAlign="center"
        >
          {prologue}
        </Text>
      )}
    </group>
  );
}
