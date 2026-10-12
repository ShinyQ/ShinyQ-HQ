"use client";

import { useMemo } from "react";
import { COLORS, LOBBY } from "../../config";
import { BatchedLabels } from "../../fx/BatchedLabels";
import type { BatchedLabel } from "../../fx/labelProps";
import type { ExperienceData } from "../../types";
import { FONTS, GlassBox } from "../../tower/primitives";
import { SKILLS_PAD, SKILLS_TEXT, skillsWallLayout } from "./layout";
import type { LogoQuad } from "./logoAtlas";
import { LogoQuads } from "./LogoQuads";

// 10 u columns on the 40 u wall (appendix 01 section 2); heights come from skillsWallLayout.
const { itemSize: ITEM_SIZE, itemLine: ITEM_LINE, icon: ICON, iconGap: ICON_GAP, labelSize: LABEL_SIZE, labelLine: LABEL_LINE, labelTracking: LABEL_TRACKING } = SKILLS_TEXT;
const COLUMN_PAD = SKILLS_PAD.column;

const GROUP_ACCENT: Record<string, string> = {
  software: COLORS.cyan,
  ai: COLORS.violet,
  cloud: "#60a5fa",
  data: COLORS.amber,
};

/** Skill groups on a long glass wall north of the hologram, facing the plaza. */
export function SkillsWall({ skills, title }: { skills: ExperienceData["skills"]; title: string }) {
  const { x, z, w, d, plinth } = LOBBY.skillsWall;
  const { h, column, textWidth, itemTop: ITEM_TOP } = useMemo(() => skillsWallLayout(skills), [skills]);
  // Logo centers line up with each item line of the text block (anchorY top, fixed line height).
  const quads = useMemo<LogoQuad[]>(
    () =>
      skills.flatMap((group, i) => {
        const left = -w / 2 + i * column + COLUMN_PAD;
        return group.logos.flatMap((src, j) =>
          src ? [{ src, x: left + ICON / 2, y: h - ITEM_TOP - (j + 0.5) * ITEM_SIZE * ITEM_LINE, size: ICON }] : [],
        );
      }),
    [skills, w, h, column, ITEM_TOP],
  );
  // Title, headings and item columns in one BatchedText (one draw call instead of one per text).
  const labels = useMemo<BatchedLabel[]>(
    () => [
      { text: title.toUpperCase(), position: [0, h + 0.3, 0], font: FONTS.monoBold, fontSize: 0.42, letterSpacing: 0.12, color: COLORS.green, anchorX: "center", anchorY: "bottom" },
      ...skills.flatMap((group, i): BatchedLabel[] => {
        const left = -w / 2 + i * column + COLUMN_PAD;
        const front = d / 2 + 0.03;
        return [
          {
            text: group.label.toUpperCase(),
            position: [left, h - SKILLS_PAD.top, front],
            font: FONTS.monoBold,
            fontSize: LABEL_SIZE,
            letterSpacing: LABEL_TRACKING,
            lineHeight: LABEL_LINE,
            color: GROUP_ACCENT[group.id] ?? COLORS.white,
            anchorX: "left",
            anchorY: "top",
            textAlign: "left",
            maxWidth: textWidth,
          },
          // No maxWidth: one item per line, never wrapped (the drei Text used whiteSpace="nowrap").
          { text: group.items.join("\n"), position: [left + ICON_GAP, h - ITEM_TOP, front], font: FONTS.sans, fontSize: ITEM_SIZE, lineHeight: ITEM_LINE, color: "#e4e4e7", anchorX: "left", anchorY: "top", textAlign: "left" },
        ];
      }),
    ],
    [skills, title, h, w, d, column, textWidth, ITEM_TOP],
  );
  return (
    <group position={[x, 0, z]}>
      {/* Glowing plinth; the wall stands on it. */}
      <GlassBox size={[w, plinth, d + 0.4]} position={[0, plinth / 2, 0]} color={COLORS.green} fillOpacity={0.35} edgeOpacity={1} />
      <group position={[0, plinth, 0]}>
        <GlassBox size={[w, h, d]} position={[0, h / 2, 0]} color={COLORS.green} fillOpacity={0.05} edgeOpacity={0.85} />
        <BatchedLabels labels={labels} name="skills-labels" />
        <group position={[0, 0, d / 2 + 0.035]}>
          <LogoQuads quads={quads} />
        </group>
      </group>
    </group>
  );
}
