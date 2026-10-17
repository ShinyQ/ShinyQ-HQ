"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { getHQStore } from "@/store/useHQStore";
import { COLORS } from "../../config";
import type { ExperienceData } from "../../types";
import { FONTS, GlassBox } from "../../tower/primitives";
import { KIOSK, kioskAllLines, kioskFontSize, kioskLines, kioskParts } from "./kiosk";

const TICK = 2.2;

export interface KioskLabels {
  title: string;
  hint: string;
}

/**
 * Diegetic mirror of the Rover Terminal missions; a point-and-go target (L1:kiosk:ask-rover) that opens
 * the Rover menu. Body, stand and screen turn as one unit (floors/lobby/kiosk.ts); lines never wrap.
 */
export function MissionKiosk({ missions, labels }: { missions: ExperienceData["missions"]; labels: KioskLabels }) {
  const parts = useMemo(() => kioskParts(), []);
  const names = useMemo(() => missions.map((m) => m.label), [missions]);
  const fontSize = useMemo(() => kioskFontSize(kioskAllLines(names, labels.title, labels.hint), parts.screen.w), [names, labels.title, labels.hint, parts]);
  // Five missions at a time, one line every 2.2 s (static under reduced motion).
  const [offset, setOffset] = useState(0);
  const clock = useRef(0);
  useFrame((_, dt) => {
    if (names.length <= KIOSK.visible || getHQStore().getState().reducedMotion) return;
    clock.current += Math.min(dt, 0.1);
    if (clock.current > TICK) {
      clock.current = 0;
      setOffset((o) => (o + 1) % names.length);
    }
  });
  const text = kioskLines(names, labels.title, labels.hint, offset, parts.screen.w).join("\n");
  const { group, body, stand, screen } = parts;
  return (
    <group position={group.position} rotation={[0, group.yaw, 0]}>
      <GlassBox size={body.size} position={body.position} color={COLORS.green} fillOpacity={0.1} />
      <mesh position={stand.position} raycast={() => null}>
        <boxGeometry args={stand.size} />
        <meshBasicMaterial color={COLORS.green} transparent opacity={0.35} toneMapped={false} />
      </mesh>
      <group position={screen.position} rotation={[-screen.tilt, 0, 0]}>
        <mesh raycast={() => null}>
          <planeGeometry args={[screen.w, screen.h]} />
          <meshBasicMaterial color={COLORS.terminalBg} transparent opacity={0.95} />
        </mesh>
        <Text
          font={FONTS.mono}
          fontSize={fontSize}
          color={COLORS.terminalFg}
          anchorX="left"
          anchorY="top"
          position={[-screen.w / 2 + KIOSK.screen.pad, screen.h / 2 - KIOSK.screen.pad, 0.01]}
          lineHeight={KIOSK.screen.lineHeight}
          whiteSpace="nowrap"
          material-toneMapped={false}
        >
          {text}
        </Text>
      </group>
    </group>
  );
}
