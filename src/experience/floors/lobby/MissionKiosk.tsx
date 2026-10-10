"use client";

import { Text } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useRef, useState } from "react";
import { getHQStore } from "@/store/useHQStore";
import { COLORS, LOBBY } from "../../config";
import { intents } from "../../input/intents";
import type { ExperienceData } from "../../types";
import { FONTS, GlassBox } from "../../tower/primitives";

const VISIBLE = 5;
const TICK = 2.2;

export interface KioskLabels {
  title: string;
  hint: string;
}

/** Diegetic mirror of the Rover Terminal missions; clicking it opens the terminal. */
export function MissionKiosk({ missions, labels }: { missions: ExperienceData["missions"]; labels: KioskLabels }) {
  const { x, z, w, d } = LOBBY.kiosk;
  // The screen shows five missions at a time and scrolls one line every 2.2 s (static under reduced motion).
  const [offset, setOffset] = useState(0);
  const clock = useRef(0);
  useFrame((_, dt) => {
    if (missions.length <= VISIBLE || getHQStore().getState().reducedMotion) return;
    clock.current += Math.min(dt, 0.1);
    if (clock.current > TICK) {
      clock.current = 0;
      setOffset((o) => (o + 1) % missions.length);
    }
  });
  const shown = Array.from({ length: Math.min(VISIBLE, missions.length) }, (_, k) => (offset + k) % missions.length);
  const lines = [labels.title, ...shown.map((i) => `${i + 1}. ${missions[i].label}`), "", `> ${labels.hint}`].join("\n");
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    intents.emit({ type: "terminal" });
  };
  return (
    <group position={[x, 0, z]}>
      <GlassBox size={[w, 1.2, d]} position={[0, 0.6, 0]} color={COLORS.green} fillOpacity={0.1} />
      <group position={[0.3, 2.15, 0.3]} rotation={[0, Math.PI / 4, 0]}>
        <group rotation={[-0.3, 0, 0]}>
          <mesh onClick={onClick}>
            <planeGeometry args={[3.1, 1.9]} />
            <meshBasicMaterial color={COLORS.terminalBg} transparent opacity={0.95} />
          </mesh>
          <Text
            font={FONTS.mono}
            fontSize={0.12}
            color={COLORS.terminalFg}
            anchorX="left"
            anchorY="top"
            position={[-1.45, 0.82, 0.01]}
            lineHeight={1.45}
            maxWidth={2.9}
            material-toneMapped={false}
          >
            {lines}
          </Text>
        </group>
      </group>
    </group>
  );
}
