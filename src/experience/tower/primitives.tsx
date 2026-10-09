"use client";

import { useMemo, type ReactNode } from "react";
import { BoxGeometry, BufferGeometry, EdgesGeometry, Float32BufferAttribute } from "three";

export const FONTS = {
  sans: "/fonts/inter-latin-400-normal.woff",
  sansBold: "/fonts/inter-latin-800-normal.woff",
  mono: "/fonts/jetbrains-mono-latin-400-normal.woff",
  monoBold: "/fonts/jetbrains-mono-latin-700-normal.woff",
} as const;

type V3 = [number, number, number];

/** Neon edge lines of a box (one draw call). */
export function BoxEdges({ size, position, color, opacity = 0.95 }: { size: V3; position?: V3; color: string; opacity?: number }) {
  const [w, h, d] = size;
  const geometry = useMemo(() => new EdgesGeometry(new BoxGeometry(w, h, d)), [w, h, d]);
  return (
    <lineSegments geometry={geometry} position={position}>
      <lineBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
    </lineSegments>
  );
}

/** Wireframe glass box: a faint fill plus neon edges (appendix 05 room material). */
export function GlassBox({
  size,
  position,
  color,
  fillOpacity = 0.05,
  edgeOpacity = 0.95,
  children,
}: {
  size: V3;
  position?: V3;
  color: string;
  fillOpacity?: number;
  edgeOpacity?: number;
  children?: ReactNode;
}) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={size} />
        <meshBasicMaterial color={color} transparent opacity={fillOpacity} depthWrite={false} toneMapped={false} />
      </mesh>
      <BoxEdges size={size} color={color} opacity={edgeOpacity} />
      {children}
    </group>
  );
}

/** Flat grid of lines on the floor plane (one draw call). */
export function GridLines({
  width,
  depth,
  step = 2,
  color,
  opacity = 0.3,
  position,
}: {
  width: number;
  depth: number;
  step?: number;
  color: string;
  opacity?: number;
  position?: V3;
}) {
  const geometry = useMemo(() => {
    const pts: number[] = [];
    const hw = width / 2;
    const hd = depth / 2;
    for (let x = -hw; x <= hw + 1e-6; x += step) pts.push(x, 0, -hd, x, 0, hd);
    for (let z = -hd; z <= hd + 1e-6; z += step) pts.push(-hw, 0, z, hw, 0, z);
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return g;
  }, [width, depth, step]);
  return (
    <lineSegments geometry={geometry} position={position}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </lineSegments>
  );
}

/** Polyline helper (closed loops or open paths) on the floor. */
export function FloorLine({ points, color, opacity = 0.7, closed = false }: { points: [number, number][]; color: string; opacity?: number; closed?: boolean }) {
  const geometry = useMemo(() => {
    const pts: number[] = [];
    const n = closed ? points.length : points.length - 1;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      pts.push(a[0], 0.03, a[1], b[0], 0.03, b[1]);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return g;
  }, [points, closed]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
    </lineSegments>
  );
}
