"use client";

import { Text } from "@react-three/drei";
import { COLORS, LOBBY } from "../../config";
import type { ExperienceData } from "../../types";
import { FONTS, GlassBox } from "../../tower/primitives";

const GROUP_ACCENT: Record<string, string> = {
  software: COLORS.cyan,
  ai: COLORS.violet,
  cloud: "#60a5fa",
  data: COLORS.amber,
};

/** Skill groups on a long glass wall north of the hologram, facing the plaza. */
export function SkillsWall({ skills, title }: { skills: ExperienceData["skills"]; title: string }) {
  const { x, z, w, d, h } = LOBBY.skillsWall;
  const column = w / Math.max(1, skills.length);
  return (
    <group position={[x, 0, z]}>
      <GlassBox size={[w, h, d]} position={[0, h / 2, 0]} color={COLORS.green} fillOpacity={0.05} edgeOpacity={0.85} />
      <Text font={FONTS.monoBold} fontSize={0.42} letterSpacing={0.12} color={COLORS.green} anchorX="center" anchorY="bottom" position={[0, h + 0.3, 0]} material-toneMapped={false}>
        {title.toUpperCase()}
      </Text>
      {skills.map((group, i) => {
        const left = -w / 2 + i * column + 0.45;
        const accent = GROUP_ACCENT[group.id] ?? COLORS.white;
        return (
          <group key={group.id} position={[left, 0, d / 2 + 0.03]}>
            <Text font={FONTS.monoBold} fontSize={0.3} letterSpacing={0.08} color={accent} anchorX="left" anchorY="top" position={[0, h - 0.35, 0]} maxWidth={column - 0.8} material-toneMapped={false}>
              {group.label.toUpperCase()}
            </Text>
            <Text font={FONTS.sans} fontSize={0.27} color="#e4e4e7" anchorX="left" anchorY="top" position={[0, h - 0.95, 0]} lineHeight={1.32} maxWidth={column - 0.8}>
              {group.items.join("\n")}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
