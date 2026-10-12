"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { Vector3, type Group } from "three";
import type { Wing } from "@/content/schema";
import { yawTowards } from "../../fx/facing";
import type { LabPod, Vec2 } from "../../types";
import { FONTS, GlassBox } from "../../tower/primitives";
import { LABS, tourOrder, WING_TINT, type LabsLayout } from "./layout";

export interface HubLabels {
  wings: Record<Wing, string>;
  directory: string;
  /** Board footer: the full list opens in the palette. */
  open: string;
  /** "{count} projects", localized. */
  count: (count: number) => string;
}

const WINGS = ["software", "ai"] as const;
const { board } = LABS;
const TIER_MARK: Record<LabPod["tier"], string> = { hero: "\u25C6", featured: "\u25C7", listed: "\u00B7" };
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

const TOP = { name: 0.3, sub: 1.05, list: 1.55, listBottom: 1.95, footer: 1.3 } as const;

/**
 * One face of a directory board, sized to read from the board stop on a phone: the wing name, the
 * project count, the top entries (docking order, gallery first) in large type, and a footer that points to the
 * full list (clicking the board, or Open on the tour stop, opens the projects palette).
 */
function BoardFace({ wing, list, labels, side }: { wing: Wing; list: readonly LabPod[]; labels: HubLabels; side: 1 | -1 }) {
  const name = labels.wings[wing].toUpperCase();
  const top = tourOrder(list).slice(0, LABS.boardEntries);
  const lines = top.map((p) => `${TIER_MARK[p.tier]} ${p.title}`).join("\n");
  const width = board.d - 0.6;
  return (
    <group position={[(side * board.w) / 2 + side * 0.03, 0, 0]} rotation={[0, (side * Math.PI) / 2, 0]}>
      {/* Wing names come from messages (`common.wing`); long names shrink to the board width instead of wrapping. */}
      <Text
        font={FONTS.monoBold}
        fontSize={Math.min(0.56, width / (0.62 * Math.max(1, name.length)))}
        color={WING_TINT[wing]}
        anchorX="center"
        anchorY="top"
        whiteSpace="nowrap"
        position={[0, board.h - TOP.name, 0]}
        material-toneMapped={false}
      >
        {name}
      </Text>
      <Text font={FONTS.mono} fontSize={0.24} color="#a1a1aa" anchorX="center" anchorY="top" whiteSpace="nowrap" position={[0, board.h - TOP.sub, 0]}>
        {`${labels.directory.toUpperCase()} \u00B7 ${labels.count(list.length).toUpperCase()}`}
      </Text>
      <Text
        font={FONTS.sansBold}
        fontSize={0.34}
        lineHeight={1.25}
        maxWidth={width}
        color="#f4f4f5"
        anchorX="left"
        anchorY="top"
        position={[-width / 2, board.h - TOP.list, 0]}
        clipRect={[-0.05, -(board.h - TOP.list - TOP.listBottom), width + 0.1, 0.2]}
      >
        {lines}
      </Text>
      <Text font={FONTS.monoBold} fontSize={0.3} color={WING_TINT[wing]} anchorX="center" anchorY="bottom" whiteSpace="nowrap" position={[0, TOP.footer, 0]} material-toneMapped={false}>
        {`\u25B8 ${labels.open.toUpperCase()}`}
      </Text>
    </group>
  );
}

/**
 * Directory boards on the hub rim. Both faces carry the same content: the east face greets the hub
 * and the stop in front of it, the west face the rover arriving from the elevator.
 */
function DirectoryBoards({ layout, labels, pods }: { layout: LabsLayout; labels: HubLabels; pods: readonly LabPod[] }) {
  return (
    <group>
      {WINGS.map((wing) => {
        const { center } = layout.boards[wing];
        const list = pods.filter((p) => p.wing === wing);
        return (
          <group key={wing} position={[center.x, 0, center.z]} name={`directory-${wing}`}>
            <GlassBox size={[board.w, board.h, board.d]} position={[0, board.h / 2, 0]} color={WING_TINT[wing]} fillOpacity={0.12} />
            {/* Opaque core: each face shows only its own text, never the mirrored one behind it. */}
            <mesh position={[0, board.h / 2, 0]}>
              <boxGeometry args={[board.w * 0.5, board.h - 0.04, board.d - 0.04]} />
              <meshBasicMaterial color="#070712" />
            </mesh>
            <BoardFace wing={wing} list={list} labels={labels} side={1} />
            <BoardFace wing={wing} list={list} labels={labels} side={-1} />
          </group>
        );
      })}
    </group>
  );
}

/** The hub plaza in front of the elevator: wing directory boards and the floating signs to each wing road. */
export function Hub({ layout, labels, pods }: { layout: LabsLayout; labels: HubLabels; pods: readonly LabPod[] }) {
  return (
    <group name="labs-hub">
      <WingSigns layout={layout} labels={labels} />
      <DirectoryBoards layout={layout} labels={labels} pods={pods} />
    </group>
  );
}
