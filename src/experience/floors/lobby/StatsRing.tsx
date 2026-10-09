"use client";

import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { getHQStore } from "@/store/useHQStore";
import { COLORS, LOBBY } from "../../config";
import type { ExperienceData } from "../../types";
import { BoxEdges, FONTS } from "../../tower/primitives";

const ACCENTS = [COLORS.green, COLORS.cyan, COLORS.violet, COLORS.amber, COLORS.pink, "#60a5fa"];
const TILE_W = 3.4;
const TILE_H = 1.9;

/** Headline stats as floating tiles on a ring around the hologram (appendix 01 section 2). */
export function StatsRing({ stats }: { stats: ExperienceData["stats"] }) {
  const ring = useRef<Group>(null);

  useFrame((state, dt) => {
    if (!ring.current) return;
    const reduced = getHQStore().getState().reducedMotion;
    if (reduced) return;
    ring.current.rotation.y += Math.min(dt, 0.1) * 0.06;
    ring.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.15;
  });

  return (
    <group position={[LOBBY.hologram.x, 0, LOBBY.hologram.z]}>
      <group ref={ring}>
        {stats.map((stat, i) => {
          const a = (i / stats.length) * Math.PI * 2 + Math.PI / 4;
          const accent = ACCENTS[i % ACCENTS.length];
          return (
            <Billboard key={stat.id} position={[Math.sin(a) * LOBBY.statsRadius, 3.6 + (i % 2) * 0.5, Math.cos(a) * LOBBY.statsRadius]}>
              <mesh>
                <planeGeometry args={[TILE_W, TILE_H]} />
                <meshBasicMaterial color="#0f0f19" transparent opacity={0.86} />
              </mesh>
              <BoxEdges size={[TILE_W, TILE_H, 0.01]} color={accent} opacity={0.9} />
              <Text
                font={FONTS.sansBold}
                fontSize={0.62}
                color={accent}
                anchorX="left"
                anchorY="middle"
                position={[-TILE_W / 2 + 0.2, TILE_H / 2 - 0.45, 0.02]}
                material-toneMapped={false}
              >
                {stat.value}
              </Text>
              <Text
                font={FONTS.sans}
                fontSize={0.17}
                color="#d4d4d8"
                anchorX="left"
                anchorY="top"
                lineHeight={1.35}
                maxWidth={TILE_W - 0.4}
                position={[-TILE_W / 2 + 0.2, TILE_H / 2 - 0.9, 0.02]}
              >
                {stat.label}
              </Text>
            </Billboard>
          );
        })}
      </group>
    </group>
  );
}
