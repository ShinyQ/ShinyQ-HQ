"use client";

import { useEffect, useMemo } from "react";
import { useHQStore } from "@/store/useHQStore";
import { BatchedLabels } from "../../fx/BatchedLabels";
import { FloatingSigns } from "../../fx/FloatingSign";
import { signPlate, type SignSpec } from "../../fx/signLayout";
import { neonColor } from "../../fx/materials";
import type { LabPod } from "../../types";
import { FONTS } from "../../tower/primitives";
import { MergedBoxes } from "../roof/kit";
import { wallLabels, wallLines, wallSolids, type DirectoryLabels } from "./directory";
import { LABS, WING_TINT, type LabsLayout } from "./layout";
import { LineBatch } from "./lines";

export type HubLabels = DirectoryLabels;

const WINGS = ["software", "ai"] as const;
/** Height of the floating wing signs (bottom of the plate). */
const SIGN_Y = 4.2;
const NO_RAYCAST = () => null;

/** Type size of the floating wing signs. */
const SIGN_FONT = 1;

/**
 * The wing names floating above each wing road where it leaves the hub (owner request 2026-10-13:
 * nothing painted on the floor), on the shared `FloatingSigns`: turned to the camera every frame (yaw
 * only) on a dark plate with a rim in the wing tint, so they read from any camera yaw and never mirror.
 */
function WingSigns({ layout, labels }: { layout: LabsLayout; labels: HubLabels }) {
  const tier = useHQStore((s) => s.tier);
  const signs = useMemo<SignSpec[]>(
    () =>
      WINGS.map((wing) => {
        const text = labels.wings[wing].toUpperCase();
        const { h } = signPlate({ text, fontSize: SIGN_FONT });
        const at = layout.signs[wing].float;
        return { text, x: at.x, y: SIGN_Y + h / 2, z: at.z, color: WING_TINT[wing], fontSize: SIGN_FONT, font: FONTS.monoBold };
      }),
    [layout, labels],
  );
  return <FloatingSigns signs={signs} name="labs-wing-signs" tier={tier} />;
}

/**
 * The wing directory wall where the wing roads fork (owner request 2026-10-13: noticeable on arrival):
 * both panels in one merged mesh, their neon rims and title underlines in one line batch (boosted on
 * the full tier so they bloom), every text in one BatchedText. Three draw calls in all. Phones list
 * the top three projects in larger type, other screens the top five. Clicks go
 * through point-and-go (`L3:board:<wing>` in interact/registry.ts), never handlers on these meshes.
 */
function DirectoryWall({ labels, pods }: { labels: HubLabels; pods: readonly LabPod[] }) {
  const tier = useHQStore((s) => s.tier);
  // Phones show the top three in larger type (`LIST_STYLE.compact`); everything else the top five.
  const size = useHQStore((s) => (s.device.viewport === "mobile" ? "compact" : "full"));
  const solids = useMemo(() => wallSolids(), []);
  const texts = useMemo(() => wallLabels(pods, labels, FONTS, size), [pods, labels, size]);
  const lines = useMemo(() => {
    const batch = new LineBatch();
    for (const line of wallLines()) batch.segment(line.seg, line.color);
    return batch.build();
  }, []);
  useEffect(() => () => lines.dispose(), [lines]);
  const boost = useMemo(() => neonColor("#ffffff", 1.6, tier), [tier]);
  return (
    <group name="directory-wall">
      <MergedBoxes boxes={solids} color="#0b1020" emissive={LABS.accent} emissiveIntensity={0.06} />
      <lineSegments geometry={lines} raycast={NO_RAYCAST}>
        <lineBasicMaterial color={boost} vertexColors transparent opacity={0.95} toneMapped={false} />
      </lineSegments>
      <BatchedLabels labels={texts} name="directory-labels" />
    </group>
  );
}

/** The hub plaza in front of the elevator: the floating signs to each wing road, and the directory wall where the wing roads fork. */
export function Hub({ layout, labels, pods }: { layout: LabsLayout; labels: HubLabels; pods: readonly LabPod[] }) {
  return (
    <group name="labs-hub">
      <WingSigns layout={layout} labels={labels} />
      <DirectoryWall labels={labels} pods={pods} />
    </group>
  );
}
