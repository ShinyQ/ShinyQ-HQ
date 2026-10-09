"use client";

import { Text } from "@react-three/drei";
import { COLORS } from "../config";
import type { FloorLayout } from "../types";
import { FONTS, GlassBox } from "./primitives";

export interface PlaceholderLabels {
  construction: string;
  hint: string;
}

/** Empty slab plus a standing label. Later phases replace these floors with real content. */
export function PlaceholderFloor({ layout, name, labels }: { layout: FloorLayout; name: string; labels: PlaceholderLabels }) {
  const position: [number, number, number] = [layout.approach.x + 9, 0, -7];
  const rotation: [number, number, number] = [0, Math.PI / 4, 0];

  return (
    <group>
      <group position={position} rotation={rotation}>
        <Text font={FONTS.monoBold} fontSize={2.4} color={layout.accent} anchorX="center" anchorY="bottom" position={[0, 4.6, 0]} material-toneMapped={false}>
          {layout.id}
        </Text>
        <Text font={FONTS.sansBold} fontSize={1.15} color={COLORS.white} anchorX="center" anchorY="bottom" position={[0, 3.2, 0]} maxWidth={16} textAlign="center">
          {name}
        </Text>
        <Text font={FONTS.mono} fontSize={0.42} color="#a1a1aa" anchorX="center" anchorY="top" position={[0, 2.9, 0]} maxWidth={14} textAlign="center" lineHeight={1.5}>
          {`${labels.construction.toUpperCase()}\n${labels.hint}`}
        </Text>
        <GlassBox size={[10, 0.15, 0.15]} position={[0, 0.08, 0]} color={layout.accent} fillOpacity={0.3} />
      </group>
    </group>
  );
}
