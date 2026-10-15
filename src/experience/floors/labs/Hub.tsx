"use client";

import { useEffect, useMemo } from "react";
import { useHQStore } from "@/store/useHQStore";
import { BatchedLabels } from "../../fx/BatchedLabels";
import { FloatingSigns } from "../../fx/FloatingSign";
import { neonColor } from "../../fx/materials";
import type { LabPod } from "../../types";
import { FONTS } from "../../tower/primitives";
import { MergedBoxes } from "../roof/kit";
import { roadSigns, wallLabels, wallLines, wallSolids, type DirectoryLabels } from "./directory";
import { LABS, type LabsLayout } from "./layout";
import { LineBatch } from "./lines";

export type HubLabels = DirectoryLabels;

const NO_RAYCAST = () => null;

/**
 * One sign per road floating over its mouth on the hub rim (owner request 2026-10-13: nothing painted on
 * the floor; Round 7 G: three roads), on the shared `FloatingSigns`: turned to the camera every frame
 * (yaw only) on a dark plate with a rim in the wing tint, so they read from any camera yaw and never mirror.
 */
function WingSigns({ layout, labels }: { layout: LabsLayout; labels: HubLabels }) {
  const tier = useHQStore((s) => s.tier);
  const signs = useMemo(() => roadSigns(layout, labels.wings, FONTS.monoBold), [layout, labels]);
  return <FloatingSigns signs={signs} name="labs-wing-signs" tier={tier} />;
}

/**
 * The directory wall where the three roads fork (owner request 2026-10-13: noticeable on arrival; Round 7 G):
 * three raised boards on four posts, the middle one a gate over the spine. Boards and posts in one merged
 * mesh, their neon rims, post edges and title underlines in one line batch (boosted on the full tier so
 * they bloom), every text in one BatchedText. Still three draw calls in all. Phones list
 * the top three projects in larger type, other screens the top five. Clicks go
 * through point-and-go (`L3:board:<wing>` in interact/registry.ts), never handlers on these meshes.
 */
function DirectoryWall({ labels, pods, boards }: { labels: HubLabels; pods: readonly LabPod[]; boards: LabsLayout["boards"] }) {
  const tier = useHQStore((s) => s.tier);
  // Phones show the top three in larger type (`LIST_STYLE.compact`); everything else the top five.
  const size = useHQStore((s) => (s.device.viewport === "mobile" ? "compact" : "full"));
  const solids = useMemo(() => wallSolids(boards), [boards]);
  const texts = useMemo(() => wallLabels(pods, labels, FONTS, size, boards), [pods, labels, size, boards]);
  const lines = useMemo(() => {
    const batch = new LineBatch();
    for (const line of wallLines(boards)) batch.segment(line.seg, line.color);
    return batch.build();
  }, [boards]);
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

/** The hub plaza in front of the elevator: the floating sign over each road mouth, and the directory wall where the three roads fork. */
export function Hub({ layout, labels, pods }: { layout: LabsLayout; labels: HubLabels; pods: readonly LabPod[] }) {
  return (
    <group name="labs-hub">
      <WingSigns layout={layout} labels={labels} />
      <DirectoryWall labels={labels} pods={pods} boards={layout.boards} />
    </group>
  );
}
