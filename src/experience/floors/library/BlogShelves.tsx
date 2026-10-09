"use client";

import { Billboard, Text } from "@react-three/drei";
import { useState } from "react";
import type { RoomId } from "@/content/schema";
import { COLORS, FLOOR_COLOR } from "../../config";
import { BoxEdges, FONTS, GlassBox } from "../../tower/primitives";
import type { LibraryData } from "../../types";
import { languageBadge, roomHandlers } from "../interact";
import { LIBRARY, spineSlots, type SpineSlot } from "./layout";

export interface ShelfLabels {
  blog: string;
  onMedium: string;
}

type Post = LibraryData["posts"][number];

/** Spine colour: bilingual posts glow cyan, single-language posts violet, Medium posts pink. */
export function spineColor(post: Post): string {
  if (post.url) return COLORS.pink;
  return post.languages.length > 1 ? COLORS.cyan : COLORS.violet;
}

function Spine({ post, slot, labels }: { post: Post; slot: SpineSlot; labels: ShelfLabels }) {
  const [hover, setHover] = useState(false);
  const { spine } = LIBRARY;
  const color = spineColor(post);
  const y = 0.3 + spine.h / 2;
  const badge = languageBadge(post.languages);
  return (
    <group position={[slot.x, 0, slot.z - spine.d / 2 - 0.02]} name={`spine-${post.slug}`}>
      <mesh position={[0, y, 0]} {...roomHandlers(`L4:${post.slug}` as RoomId, setHover)}>
        <boxGeometry args={[spine.w, spine.h, spine.d]} />
        <meshBasicMaterial color={color} transparent opacity={hover ? 0.95 : 0.55} toneMapped={false} />
      </mesh>
      <BoxEdges size={[spine.w, spine.h, spine.d]} position={[0, y, 0]} color={color} opacity={hover ? 1 : 0.8} />
      <Text
        font={FONTS.monoBold}
        fontSize={0.21}
        color="#05050c"
        anchorX="center"
        anchorY="middle"
        rotation={[0, 0, Math.PI / 2]}
        position={[0, y, spine.d / 2 + 0.01]}
      >
        {post.date.slice(0, 4)}
      </Text>
      <Text font={FONTS.monoBold} fontSize={0.19} color={color} anchorX="center" anchorY="top" position={[0, 0.27, spine.d / 2 + 0.05]} material-toneMapped={false}>
        {badge}
      </Text>
      {hover && (
        <Billboard position={[0, LIBRARY.shelves.h + 1.1, 0.6]}>
          <mesh position={[0, 0, -0.02]}>
            <planeGeometry args={[4.6, 1.15]} />
            <meshBasicMaterial color="#0b0b16" transparent opacity={0.92} />
          </mesh>
          <Text font={FONTS.sansBold} fontSize={0.2} color={COLORS.white} anchorX="center" anchorY="bottom" position={[0, -0.05, 0]} maxWidth={4.3} textAlign="center" lineHeight={1.2}>
            {post.title}
          </Text>
          <Text font={FONTS.mono} fontSize={0.13} color={color} anchorX="center" anchorY="top" position={[0, -0.18, 0]} material-toneMapped={false}>
            {post.url ? `${badge} \u00b7 ${labels.onMedium} \u203a` : `${badge} \u00b7 ${post.date}`}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

/** Two rows of glowing book spines, one per post (newest first, alternating rows). */
export function BlogShelves({ posts, labels }: { posts: LibraryData["posts"]; labels: ShelfLabels }) {
  const { shelves } = LIBRARY;
  const slots = spineSlots(posts.length);
  const accent = FLOOR_COLOR.L4;
  return (
    <group name="blog-shelves">
      {shelves.rows.map((z) => (
        <group key={z}>
          <GlassBox size={[shelves.w, shelves.h, shelves.d]} position={[shelves.x, shelves.h / 2, z]} color={accent} fillOpacity={0.03} edgeOpacity={0.5} />
          <GlassBox size={[shelves.w, 0.08, shelves.d]} position={[shelves.x, 0.26, z]} color={accent} fillOpacity={0.2} edgeOpacity={0.4} />
        </group>
      ))}
      <Text
        font={FONTS.monoBold}
        fontSize={0.5}
        letterSpacing={0.14}
        color={accent}
        anchorX="center"
        anchorY="bottom"
        position={[shelves.x, shelves.h + 0.25, shelves.rows[0]]}
        material-toneMapped={false}
      >
        {labels.blog.toUpperCase()}
      </Text>
      {posts.map((post, i) => (
        <Spine key={post.slug} post={post} slot={slots[i]} labels={labels} />
      ))}
    </group>
  );
}
