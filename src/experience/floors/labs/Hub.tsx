"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Vector3, type Group } from "three";
import { useHQStore } from "@/store/useHQStore";
import { BatchedLabels } from "../../fx/BatchedLabels";
import { yawTowards } from "../../fx/facing";
import { neonColor } from "../../fx/materials";
import type { LabPod, Vec2 } from "../../types";
import { FONTS } from "../../tower/primitives";
import { MergedBoxes } from "../roof/kit";
import { wallLabels, wallLines, wallSolids, type DirectoryLabels } from "./directory";
import { LABS, WING_TINT, type LabsLayout } from "./layout";
import { LineBatch } from "./lines";

export type HubLabels = DirectoryLabels;

const WINGS = ["software", "ai"] as const;
/** Height of the floating wing signs (bottom of the text). */
const SIGN_Y = 4.2;
const NO_RAYCAST = () => null;
/** troika's laid-out text block: [minX, minY, maxX, maxY] in local units. */
type TextSync = { textRenderInfo?: { blockBounds?: number[] } };

/**
 * A wing name floating above its wing road where it leaves the hub (owner request 2026-10-13: nothing
 * painted on the floor). It turns to the camera every frame (yaw only, so it stays upright) on a dark
 * backing, so it reads left to right from any camera yaw and never shows its mirrored back.
 */
function WingSign({ at, text, color }: { at: Vec2; text: string; color: string }) {
  const group = useRef<Group>(null);
  const world = useMemo(() => new Vector3(), []);
  const [box, setBox] = useState<number[] | null>(null);
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    g.getWorldPosition(world);
    g.rotation.y = yawTowards({ x: world.x, z: world.z }, { x: camera.position.x, z: camera.position.z });
  });
  return (
    <group ref={group} position={[at.x, SIGN_Y, at.z]}>
      {box && (
        <mesh position={[(box[0] + box[2]) / 2, (box[1] + box[3]) / 2, -0.02]} raycast={NO_RAYCAST}>
          <planeGeometry args={[box[2] - box[0] + 0.8, box[3] - box[1] + 0.4]} />
          <meshBasicMaterial color="#05050c" transparent opacity={0.9} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <Text
        font={FONTS.monoBold}
        fontSize={1}
        color={color}
        anchorX="center"
        anchorY="bottom"
        whiteSpace="nowrap"
        renderOrder={1}
        material-toneMapped={false}
        onSync={(t: TextSync) => {
          const b = t.textRenderInfo?.blockBounds;
          if (b) setBox([b[0], b[1], b[2], b[3]]);
        }}
      >
        {text}
      </Text>
    </group>
  );
}

function WingSigns({ layout, labels }: { layout: LabsLayout; labels: HubLabels }) {
  return (
    <group>
      {WINGS.map((wing) => (
        <WingSign key={wing} at={layout.signs[wing].float} text={labels.wings[wing].toUpperCase()} color={WING_TINT[wing]} />
      ))}
    </group>
  );
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
