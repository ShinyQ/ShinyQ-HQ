"use client";

import { Text } from "@react-three/drei";
import type { Wing } from "@/content/schema";
import type { LabPod } from "../../types";
import { FONTS, GlassBox } from "../../tower/primitives";
import { LABS, WING_SIDE, WING_TINT, type LabsLayout } from "./layout";

export interface AtriumLabels {
  wings: Record<Wing, string>;
  directory: string;
}

const { atrium, bounds, pillar } = LABS;
const TIER_MARK: Record<LabPod["tier"], string> = { hero: "\u25C6", featured: "\u25C7", listed: "\u00B7" };

/** Floor tints: the atrium plus one band per wing (Software north in cyan, AI south in violet). */
function Tints() {
  const wingW = bounds.maxX - atrium.maxX;
  const wingD = bounds.maxZ - 1;
  return (
    <group>
      <GlassBox
        size={[atrium.maxX - atrium.minX, 0.03, atrium.maxZ - atrium.minZ]}
        position={[(atrium.minX + atrium.maxX) / 2, 0.015, 0]}
        color={LABS.accent}
        fillOpacity={0.08}
        edgeOpacity={0.7}
      />
      {(["software", "ai"] as const).map((wing) => (
        <GlassBox
          key={wing}
          size={[wingW, 0.02, wingD]}
          position={[atrium.maxX + wingW / 2, 0.01, WING_SIDE[wing] * (1 + wingD / 2)]}
          color={WING_TINT[wing]}
          fillOpacity={0.045}
          edgeOpacity={0.35}
        />
      ))}
    </group>
  );
}

/** Wing signs painted on the floor, pointing east into each hall from the atrium. */
function WingSigns({ labels }: { labels: AtriumLabels }) {
  return (
    <group>
      {(["software", "ai"] as const).map((wing) => (
        <group key={wing}>
          <Text
            font={FONTS.monoBold}
            fontSize={1.05}
            color={WING_TINT[wing]}
            anchorX="left"
            anchorY="middle"
            rotation={[-Math.PI / 2, 0, 0]}
            position={[atrium.maxX - 1, 0.05, WING_SIDE[wing] * 4.2]}
            material-toneMapped={false}
          >
            {`${labels.wings[wing].toUpperCase()}  \u2192`}
          </Text>
          <Text
            font={FONTS.monoBold}
            fontSize={0.9}
            color={WING_TINT[wing]}
            anchorX="center"
            anchorY="bottom"
            rotation={[0, Math.PI / 4, 0]}
            position={[-3, 3.2, WING_SIDE[wing] * 13.5]}
            material-toneMapped={false}
          >
            {labels.wings[wing].toUpperCase()}
          </Text>
        </group>
      ))}
    </group>
  );
}

/** Directory boards in the atrium: every pod of the wing, listed items included (they open in the drawer). */
function DirectoryBoards({ layout, labels, pods }: { layout: LabsLayout; labels: AtriumLabels; pods: readonly LabPod[] }) {
  return (
    <group>
      {(["software", "ai"] as const).map((wing) => {
        const { center } = layout.pillars[wing];
        const list = pods.filter((p) => p.wing === wing);
        const lines = list.map((p) => `${TIER_MARK[p.tier]} ${p.title}`).join("\n");
        return (
          <group key={wing} position={[center.x, 0, center.z]}>
            <GlassBox size={[pillar.w, pillar.h, pillar.d]} position={[0, pillar.h / 2, 0]} color={WING_TINT[wing]} fillOpacity={0.12} />
            <group position={[pillar.w / 2 + 0.03, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <Text font={FONTS.monoBold} fontSize={0.24} color={WING_TINT[wing]} anchorX="center" anchorY="top" position={[0, pillar.h - 0.25, 0]} material-toneMapped={false}>
                {`${labels.wings[wing].toUpperCase()} \u00B7 ${labels.directory.toUpperCase()}`}
              </Text>
              <Text
                font={FONTS.sans}
                fontSize={list.length > 14 ? 0.17 : 0.2}
                lineHeight={1.3}
                whiteSpace="nowrap"
                color="#e5e7eb"
                anchorX="left"
                anchorY="top"
                position={[-pillar.d / 2 + 0.2, pillar.h - 0.7, 0]}
                clipRect={[-0.05, -(pillar.h - 0.9), pillar.d - 0.4, 0.2]}
              >
                {lines}
              </Text>
            </group>
          </group>
        );
      })}
    </group>
  );
}

export function Atrium({ layout, labels, pods }: { layout: LabsLayout; labels: AtriumLabels; pods: readonly LabPod[] }) {
  return (
    <group name="labs-atrium">
      <Tints />
      <WingSigns labels={labels} />
      <DirectoryBoards layout={layout} labels={labels} pods={pods} />
    </group>
  );
}
