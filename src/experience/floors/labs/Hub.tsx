"use client";

import { Text } from "@react-three/drei";
import type { Wing } from "@/content/schema";
import type { LabPod } from "../../types";
import { FONTS, GlassBox } from "../../tower/primitives";
import { LABS, WING_TINT, type LabsLayout } from "./layout";

export interface HubLabels {
  wings: Record<Wing, string>;
  directory: string;
  /** Footer of each directory board ("More projects here"). */
  more: string;
}

const WINGS = ["software", "ai"] as const;
const { board } = LABS;
const TIER_MARK: Record<LabPod["tier"], string> = { hero: "\u25C6", featured: "\u25C7", listed: "\u00B7" };
/** Turned toward the default follow camera (it looks along -x, -z). */
const FACE_CAMERA: [number, number, number] = [0, Math.PI / 4, 0];

/** Wing names where each wing road leaves the hub: painted along the road and floating above it. */
function WingSigns({ layout, labels }: { layout: LabsLayout; labels: HubLabels }) {
  return (
    <group>
      {WINGS.map((wing) => {
        const { at, heading } = layout.signs[wing];
        const angle = Math.atan2(-heading.z, heading.x);
        return (
          <group key={wing}>
            <group position={[at.x, 0.06, at.z]} rotation={[0, angle, 0]}>
              <Text font={FONTS.monoBold} fontSize={1.1} color={WING_TINT[wing]} anchorX="center" anchorY="middle" rotation={[-Math.PI / 2, 0, 0]} material-toneMapped={false}>
                {`${labels.wings[wing].toUpperCase()}  \u2192`}
              </Text>
            </group>
            <Text
              font={FONTS.monoBold}
              fontSize={0.95}
              color={WING_TINT[wing]}
              outlineWidth={0.02}
              outlineColor="#05050c"
              anchorX="center"
              anchorY="bottom"
              rotation={FACE_CAMERA}
              position={[at.x + heading.x * 5, 4.2, at.z + heading.z * 5]}
              material-toneMapped={false}
            >
              {labels.wings[wing].toUpperCase()}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

/** One face of a directory board: header, every pod of the wing and the "More projects here" footer. */
function BoardFace({ wing, list, labels, side }: { wing: Wing; list: readonly LabPod[]; labels: HubLabels; side: 1 | -1 }) {
  const lines = list.map((p) => `${TIER_MARK[p.tier]} ${p.title}`).join("\n");
  return (
    <group position={[(side * board.w) / 2 + side * 0.03, 0, 0]} rotation={[0, (side * Math.PI) / 2, 0]}>
      {/* Wing names come from messages (`common.wing`); long names shrink to the board width instead of wrapping. */}
      <Text
        font={FONTS.monoBold}
        fontSize={Math.min(0.32, (board.d - 0.5) / (0.62 * Math.max(1, labels.wings[wing].length)))}
        color={WING_TINT[wing]}
        anchorX="center"
        anchorY="top"
        whiteSpace="nowrap"
        position={[0, board.h - 0.25, 0]}
        material-toneMapped={false}
      >
        {labels.wings[wing].toUpperCase()}
      </Text>
      <Text font={FONTS.mono} fontSize={0.18} color="#a1a1aa" anchorX="center" anchorY="top" position={[0, board.h - 0.68, 0]}>
        {labels.directory.toUpperCase()}
      </Text>
      <Text
        font={FONTS.sans}
        fontSize={list.length > 14 ? 0.19 : 0.23}
        lineHeight={1.3}
        whiteSpace="nowrap"
        color="#e5e7eb"
        anchorX="left"
        anchorY="top"
        position={[-board.d / 2 + 0.25, board.h - 1.05, 0]}
        clipRect={[-0.05, -(board.h - 1.7), board.d - 0.5, 0.2]}
      >
        {lines}
      </Text>
      <Text font={FONTS.monoBold} fontSize={0.26} color={WING_TINT[wing]} anchorX="center" anchorY="bottom" position={[0, 0.3, 0]} material-toneMapped={false}>
        {`${labels.more.toUpperCase()} \u2193`}
      </Text>
    </group>
  );
}

/**
 * Directory boards on the hub rim: every pod of the wing, listed items included (they open in the
 * drawer). Both faces carry the list: the east face greets the hub and the stop in front of it, the
 * west face the rover arriving from the elevator.
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
            {/* Opaque core: each face shows only its own list, never the mirrored one behind it. */}
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

/** The hub plaza in front of the elevator: wing directory boards and the signs to each wing road. */
export function Hub({ layout, labels, pods }: { layout: LabsLayout; labels: HubLabels; pods: readonly LabPod[] }) {
  return (
    <group name="labs-hub">
      <WingSigns layout={layout} labels={labels} />
      <DirectoryBoards layout={layout} labels={labels} pods={pods} />
    </group>
  );
}
