"use client";

import { useEffect, useMemo } from "react";
import { useHQStore } from "@/store/useHQStore";
import { BatchedLabels } from "../../fx/BatchedLabels";
import { neonColor } from "../../fx/materials";
import type { LabPod } from "../../types";
import { FONTS } from "../../tower/primitives";
import { MergedBoxes } from "../roof/kit";
import { wallLabels, wallLines, wallSolids, type DirectoryLabels } from "./directory";
import { LABS, type LabsLayout } from "./layout";
import { LineBatch } from "./lines";

export type HubLabels = DirectoryLabels;

const NO_RAYCAST = () => null;

/**
 * The directory boards where the three roads fork (owner request 2026-10-13: noticeable on arrival; plan
 * 2026-10-16: three free-standing boards, the Data and ML board a gate over the spine on two posts, each side
 * board on a pylon turned toward the axis; the board titles are the only name of each path). Boards and posts in one merged
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

/** The hub plaza in front of the elevator: the directory boards where the three roads fork. */
export function Hub({ layout, labels, pods }: { layout: LabsLayout; labels: HubLabels; pods: readonly LabPod[] }) {
  return (
    <group name="labs-hub">
      <DirectoryWall labels={labels} pods={pods} boards={layout.boards} />
    </group>
  );
}
