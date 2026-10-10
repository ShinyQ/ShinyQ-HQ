"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { BoxGeometry, BufferGeometry, EdgesGeometry, Float32BufferAttribute } from "three";
import { useHQStore } from "@/store/useHQStore";
import { getGlassMaterial, glassSidesGeometry, rimGeometry, rimThickness } from "../fx/geometry";
import { neonColor } from "../fx/materials";

export const FONTS = {
  sans: "/fonts/inter-latin-400-normal.woff",
  sansBold: "/fonts/inter-latin-800-normal.woff",
  mono: "/fonts/jetbrains-mono-latin-400-normal.woff",
  monoBold: "/fonts/jetbrains-mono-latin-700-normal.woff",
} as const;

type V3 = [number, number, number];

/** Neon edge lines of a box (one draw call). Boosted above 1.0 on the full tier so they bloom. */
export function BoxEdges({ size, position, color, opacity = 0.95, boost = 1.4 }: { size: V3; position?: V3; color: string; opacity?: number; boost?: number }) {
  const [w, h, d] = size;
  const tier = useHQStore((s) => s.tier);
  const geometry = useMemo(() => new EdgesGeometry(new BoxGeometry(w, h, d)), [w, h, d]);
  const neon = useMemo(() => neonColor(color, boost, tier), [color, boost, tier]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} position={position}>
      <lineBasicMaterial color={neon} transparent opacity={opacity} toneMapped={false} />
    </lineSegments>
  );
}

/**
 * The full tier blends in the composer's linear buffer, which lifts dark translucent tints about 2 to 3
 * times compared with blending on the sRGB canvas (lite). Fills are scaled down there so both tiers match.
 */
export function tierFill(opacity: number, tier: string): number {
  return tier === "full" ? Math.round(opacity * 0.4 * 1000) / 1000 : opacity;
}

/** Below this height a box is a slab or strip: its top face carries the tint, so it keeps a flat fill. */
const FLAT_H = 0.5;

/**
 * Glass room box from the prototype: four side walls with the fresnel and scanline glass shader
 * (one shared material per color and opacity) plus thin neon rim bars on every edge. Two draw calls.
 * Flat boxes keep a plain tinted fill. `rim={false}` falls back to hairline edges.
 */
export function GlassBox({
  size,
  position,
  color,
  fillOpacity = 0.05,
  edgeOpacity = 0.95,
  rim = true,
  children,
}: {
  size: V3;
  position?: V3;
  color: string;
  fillOpacity?: number;
  edgeOpacity?: number;
  rim?: boolean;
  children?: ReactNode;
}) {
  const [w, h, d] = size;
  const tier = useHQStore((s) => s.tier);
  const coarse = useHQStore((s) => s.device.coarse);
  const flat = h < FLAT_H;
  const sides = useMemo(() => (flat ? null : glassSidesGeometry(w, h, d)), [flat, w, h, d]);
  const rims = useMemo(() => (rim ? rimGeometry(w, h, d, rimThickness(w, h, d, coarse)) : null), [rim, w, h, d, coarse]);
  const neon = useMemo(() => neonColor(color, 1.4, tier), [color, tier]);
  useEffect(
    () => () => {
      sides?.dispose();
      rims?.dispose();
    },
    [sides, rims],
  );
  return (
    <group position={position}>
      {sides ? (
        <mesh geometry={sides} material={getGlassMaterial(color, tierFill(fillOpacity, tier))} renderOrder={2} />
      ) : (
        <mesh>
          <boxGeometry args={size} />
          <meshBasicMaterial color={color} transparent opacity={tierFill(fillOpacity, tier)} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {rims ? (
        <mesh geometry={rims}>
          <meshBasicMaterial color={neon} transparent opacity={edgeOpacity} toneMapped={false} />
        </mesh>
      ) : (
        <BoxEdges size={size} color={color} opacity={edgeOpacity} />
      )}
      {children}
    </group>
  );
}

export { getGlassMaterial };

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
