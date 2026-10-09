"use client";

import { Text } from "@react-three/drei";
import { useState } from "react";
import type { RoomId } from "@/content/schema";
import { COLORS, FLOOR_COLOR } from "../../config";
import { BoxEdges, FONTS, GlassBox } from "../../tower/primitives";
import type { LibraryData } from "../../types";
import { roomHandlers } from "../interact";
import { LIBRARY } from "./layout";

export interface ShowcaseLabels {
  lectern: string;
  read: string;
  publications: string;
  talks: string;
  research: string;
  /** Profile metrics line, already formatted with its date (empty when none). */
  metrics: string;
  kind: Record<"paper" | "thesis" | "model" | "dataset", string>;
}

/** Reading lectern: shows the newest hosted post and opens it. */
export function Lectern({ post, labels }: { post: LibraryData["posts"][number] | undefined; labels: ShowcaseLabels }) {
  const [hover, setHover] = useState(false);
  const { x, z, w, d } = LIBRARY.lectern;
  if (!post) return null;
  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI / 4, 0]} name="lectern">
      <GlassBox size={[0.5, 1.1, 0.5]} position={[0, 0.55, 0]} color={FLOOR_COLOR.L4} fillOpacity={0.12} edgeOpacity={0.7} />
      <group position={[0, 1.3, 0]} rotation={[-0.55, 0, 0]}>
        <mesh {...roomHandlers(`L4:${post.slug}` as RoomId, setHover)}>
          <boxGeometry args={[w + 0.6, 0.06, d + 0.4]} />
          <meshBasicMaterial color={hover ? "#1a1a2e" : "#0d0d18"} />
        </mesh>
        <BoxEdges size={[w + 0.6, 0.06, d + 0.4]} color={COLORS.cyan} opacity={hover ? 1 : 0.7} />
        <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <Text font={FONTS.mono} fontSize={0.11} color={COLORS.cyan} anchorX="left" anchorY="top" position={[-(w + 0.4) / 2, (d + 0.2) / 2, 0]} material-toneMapped={false}>
            {labels.lectern.toUpperCase()}
          </Text>
          <Text font={FONTS.sansBold} fontSize={0.15} color={COLORS.white} anchorX="left" anchorY="top" position={[-(w + 0.4) / 2, (d + 0.2) / 2 - 0.22, 0]} maxWidth={w + 0.4} lineHeight={1.25}>
            {post.title}
          </Text>
          <Text font={FONTS.monoBold} fontSize={0.12} color={COLORS.cyan} anchorX="right" anchorY="bottom" position={[(w + 0.4) / 2, -(d + 0.2) / 2, 0]} material-toneMapped={false}>
            {`${labels.read.toUpperCase()} \u203a`}
          </Text>
        </group>
      </group>
    </group>
  );
}

const KIND_COLOR = { paper: COLORS.cyan, thesis: COLORS.amber, model: COLORS.violet, dataset: COLORS.green } as const;

/** Models shelf (room `L4:publications`): Hugging Face models and datasets as framed plates. */
export function PublicationsShelf({ publications, labels }: { publications: LibraryData["models"]; labels: ShowcaseLabels }) {
  const [hover, setHover] = useState(false);
  const { x, z, w, d, h } = LIBRARY.publications;
  const plateW = Math.min(2.4, (w - 0.6) / Math.max(1, publications.length) - 0.25);
  const step = (w - 0.6) / Math.max(1, publications.length);
  const handlers = roomHandlers("L4:publications", setHover);
  return (
    <group name="publications-shelf">
      <GlassBox size={[w, h, d]} position={[x, h / 2, z]} color={FLOOR_COLOR.L4} fillOpacity={0.03} edgeOpacity={hover ? 0.9 : 0.5} />
      <Text font={FONTS.monoBold} fontSize={0.42} letterSpacing={0.12} color={FLOOR_COLOR.L4} anchorX="center" anchorY="bottom" position={[x, h + 0.25, z]} material-toneMapped={false}>
        {labels.publications.toUpperCase()}
      </Text>
      {publications.map((p, i) => {
        const px = x - w / 2 + 0.3 + step * (i + 0.5);
        const color = KIND_COLOR[p.kind];
        return (
          <group key={p.id} position={[px, 1.45, z + d / 2 + 0.03]}>
            <mesh {...handlers}>
              <planeGeometry args={[plateW, 1.7]} />
              <meshBasicMaterial color={hover ? "#141426" : "#0c0c17"} transparent opacity={0.95} />
            </mesh>
            <BoxEdges size={[plateW, 1.7, 0.02]} color={color} opacity={0.85} />
            <Text font={FONTS.monoBold} fontSize={0.12} color={color} anchorX="left" anchorY="top" position={[-plateW / 2 + 0.12, 0.72, 0.01]} material-toneMapped={false}>
              {`${labels.kind[p.kind].toUpperCase()} \u00b7 ${p.year}`}
            </Text>
            <Text font={FONTS.sans} fontSize={0.12} color="#d4d4d8" anchorX="left" anchorY="top" position={[-plateW / 2 + 0.12, 0.48, 0.01]} maxWidth={plateW - 0.24} lineHeight={1.3}>
              {p.title}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

/** Talks stage at (16, 10): a low platform with a screen listing talks and workshops. */
export function TalksStage({ talks, labels }: { talks: LibraryData["talks"]; labels: ShowcaseLabels }) {
  const [hover, setHover] = useState(false);
  const { x, z, w, d, h } = LIBRARY.stage;
  const lines = talks.slice(0, 6).map((t) => `${t.date.slice(0, 4)}  ${t.title}`).join("\n");
  const handlers = roomHandlers("L4:talks", setHover);
  return (
    <group position={[x, 0, z]} name="talks-stage">
      <GlassBox size={[w, h, d]} position={[0, h / 2, 0]} color={COLORS.violet} fillOpacity={0.12} edgeOpacity={0.8} />
      <group position={[0, h + 2.3, -d / 2 + 0.3]}>
        <mesh {...handlers}>
          <planeGeometry args={[w - 0.6, 3.6]} />
          <meshBasicMaterial color={hover ? "#151230" : "#0d0b1e"} transparent opacity={0.95} />
        </mesh>
        <BoxEdges size={[w - 0.6, 3.6, 0.02]} color={COLORS.violet} opacity={hover ? 1 : 0.85} />
        <Text font={FONTS.monoBold} fontSize={0.3} letterSpacing={0.1} color={COLORS.violet} anchorX="left" anchorY="top" position={[-(w - 0.6) / 2 + 0.25, 1.6, 0.01]} material-toneMapped={false}>
          {labels.talks.toUpperCase()}
        </Text>
        <Text font={FONTS.sans} fontSize={0.15} color="#e4e4e7" anchorX="left" anchorY="top" position={[-(w - 0.6) / 2 + 0.25, 1.05, 0.01]} maxWidth={w - 1.1} lineHeight={1.55}>
          {lines}
        </Text>
      </group>
      {[-1, 1].map((side) => (
        <GlassBox key={side} size={[0.12, 3.9, 0.12]} position={[side * ((w - 0.6) / 2 + 0.1), h + 1.95, -d / 2 + 0.3]} color={COLORS.violet} fillOpacity={0.3} edgeOpacity={0.6} />
      ))}
    </group>
  );
}

/**
 * Research shelf east of the blog shelves: one plate per paper or thesis (newest first) and a profile
 * plate with the Scholar metrics and their date. Plates face +x, toward the follow camera.
 */
export function ResearchShelf({ research, labels }: { research: LibraryData["research"]; labels: ShowcaseLabels }) {
  const [hover, setHover] = useState(false);
  const { x, z, w, d, h } = LIBRARY.research;
  const plates = research.length + (labels.metrics ? 1 : 0);
  const step = (d - 0.6) / Math.max(1, plates);
  const plateW = Math.min(2.3, step - 0.25);
  const handlers = roomHandlers("L4:research", setHover);
  const at = (i: number) => z + d / 2 - 0.3 - step * (i + 0.5);
  return (
    <group name="research-shelf">
      <GlassBox size={[w, h, d]} position={[x, h / 2, z]} color={COLORS.amber} fillOpacity={0.04} edgeOpacity={hover ? 0.95 : 0.6} />
      <Text
        font={FONTS.monoBold}
        fontSize={0.48}
        letterSpacing={0.14}
        color={COLORS.amber}
        anchorX="center"
        anchorY="bottom"
        position={[x, h + 0.25, z]}
        rotation={[0, Math.PI / 4, 0]}
        material-toneMapped={false}
      >
        {labels.research.toUpperCase()}
      </Text>
      <group position={[x + w / 2 + 0.03, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        {research.map((p, i) => (
          <group key={p.id} position={[-at(i), 1.6, 0]}>
            <mesh {...handlers}>
              <planeGeometry args={[plateW, 1.9]} />
              <meshBasicMaterial color={hover ? "#1d1709" : "#120f08"} transparent opacity={0.95} />
            </mesh>
            <BoxEdges size={[plateW, 1.9, 0.02]} color={COLORS.amber} opacity={0.85} />
            <Text font={FONTS.monoBold} fontSize={0.12} color={COLORS.amber} anchorX="left" anchorY="top" position={[-plateW / 2 + 0.12, 0.82, 0.01]} material-toneMapped={false}>
              {[labels.kind[p.kind].toUpperCase(), p.publisher, p.year].filter(Boolean).join(" \u00b7 ")}
            </Text>
            <Text font={FONTS.sans} fontSize={0.12} color="#f4f4f5" anchorX="left" anchorY="top" position={[-plateW / 2 + 0.12, 0.56, 0.01]} maxWidth={plateW - 0.24} lineHeight={1.3}>
              {p.title}
            </Text>
          </group>
        ))}
        {labels.metrics && (
          <group position={[-at(research.length), 1.6, 0]}>
            <mesh {...handlers}>
              <planeGeometry args={[plateW, 1.9]} />
              <meshBasicMaterial color={hover ? "#1d1709" : "#120f08"} transparent opacity={0.95} />
            </mesh>
            <BoxEdges size={[plateW, 1.9, 0.02]} color={COLORS.cyan} opacity={0.85} />
            <Text font={FONTS.sansBold} fontSize={0.15} color={COLORS.cyan} anchorX="center" anchorY="middle" position={[0, 0, 0.01]} maxWidth={plateW - 0.3} textAlign="center" lineHeight={1.35} material-toneMapped={false}>
              {labels.metrics}
            </Text>
          </group>
        )}
      </group>
    </group>
  );
}
