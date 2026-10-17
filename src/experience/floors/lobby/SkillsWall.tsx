"use client";

import { useMemo } from "react";
import { COLORS, LOBBY } from "../../config";
import { BatchedLabels } from "../../fx/BatchedLabels";
import type { BatchedLabel } from "../../fx/labelProps";
import type { ExperienceData } from "../../types";
import { FONTS, GlassBox } from "../../tower/primitives";
import { SKILLS_PAD, SKILLS_TEXT, SKILLS_TITLE, skillsWallLayout } from "./layout";
import type { LogoQuad } from "./logoAtlas";
import { LogoQuads } from "./LogoQuads";

// 10 u cells, 4 across by 2 down, on the 40 u wall; heights and sub-columns come from skillsWallLayout.
const { itemSize: ITEM_SIZE, itemLine: ITEM_LINE, icon: ICON, iconGap: ICON_GAP, labelSize: LABEL_SIZE, labelLine: LABEL_LINE, labelTracking: LABEL_TRACKING } = SKILLS_TEXT;

// Heading color per skill group (palette colors only; backend, ai, azure and devops keep their colors from before).
const GROUP_ACCENT: Record<string, string> = {
  ai: COLORS.violet,
  ds: COLORS.green,
  azure: "#60a5fa",
  languages: COLORS.pink,
  backend: COLORS.cyan,
  frontend: COLORS.lane,
  data: COLORS.packet,
  devops: COLORS.amber,
};

/** Every skill group, 4 across by 2 down, on a glass wall north of the hologram, facing the plaza; every item shows. */
export function SkillsWall({ skills, title }: { skills: ExperienceData["skills"]; title: string }) {
  const { x, z, w, d, plinth } = LOBBY.skillsWall;
  const { h, textWidth, itemTop: ITEM_TOP, cells } = useMemo(() => skillsWallLayout(skills), [skills]);
  // Logo centers line up with each item line of their sub-column's text block (anchorY top, fixed line height).
  const quads = useMemo<LogoQuad[]>(
    () =>
      skills.flatMap((group, i) => {
        const cell = cells[i];
        return cell.columns.flatMap((col) =>
          col.items.flatMap((_, j) => {
            const src = group.logos[col.start + j];
            return src ? [{ src, x: col.x + ICON / 2, y: h - cell.top - ITEM_TOP - (j + 0.5) * ITEM_SIZE * ITEM_LINE, size: ICON }] : [];
          }),
        );
      }),
    [skills, cells, h, ITEM_TOP],
  );
  // Title, headings and item sub-columns in one BatchedText (one draw call instead of one per text).
  const labels = useMemo<BatchedLabel[]>(
    () => [
      { text: title.toUpperCase(), position: [0, h + SKILLS_TITLE.gap, 0], font: FONTS.monoBold, fontSize: SKILLS_TITLE.size, letterSpacing: 0.12, color: COLORS.green, anchorX: "center", anchorY: "bottom" },
      ...skills.flatMap((group, i): BatchedLabel[] => {
        const cell = cells[i];
        const front = d / 2 + 0.03;
        const top = h - cell.top;
        return [
          {
            text: group.label.toUpperCase(),
            position: [cell.left, top - SKILLS_PAD.top, front],
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
          ...cell.columns.map((col): BatchedLabel => ({
            text: col.items.join("\n"),
            position: [col.x + ICON_GAP, top - ITEM_TOP, front],
            font: FONTS.sans,
            fontSize: ITEM_SIZE,
            lineHeight: ITEM_LINE,
            color: "#e4e4e7",
            anchorX: "left",
            anchorY: "top",
            textAlign: "left",
          })),
        ];
      }),
    ],
    [skills, cells, title, h, d, textWidth, ITEM_TOP],
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
