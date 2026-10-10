"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { AdditiveBlending, type Mesh } from "three";
import { getHQStore } from "@/store/useHQStore";
import { COLORS } from "../config";
import { LaneStrip } from "../fx/LaneStrip";
import type { LibraryData } from "../types";
import { LIBRARY, LIBRARY_LANES } from "./library/layout";
import { BlogShelves, type ShelfLabels } from "./library/BlogShelves";
import { Lectern, PublicationsShelf, ResearchShelf, TalksStage, type ShowcaseLabels } from "./library/Showcase";

export type LibraryLabels = ShelfLabels & ShowcaseLabels;

/** A slow light sweep along the research plates (the DOI shimmer), one additive plane. */
function ResearchShimmer() {
  const ref = useRef<Mesh>(null);
  const { x, z, w, d } = LIBRARY.research;
  useFrame((state) => {
    if (!ref.current) return;
    const reduced = getHQStore().getState().reducedMotion;
    const p = reduced ? 0.5 : ((state.clock.elapsedTime * 0.18) % 1.4) / 1.2;
    ref.current.position.z = z - d / 2 + p * d;
    ref.current.visible = p <= 1;
  });
  return (
    <mesh ref={ref} position={[x + w / 2 + 0.06, 1.6, z]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
      <planeGeometry args={[0.5, 2.6]} />
      <meshBasicMaterial color={COLORS.cyan} transparent opacity={0.22} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** L4 Library (appendix 01 section 5), generated from content. */
export function Library({ library, labels }: { library: LibraryData; labels: LibraryLabels }) {
  const featured = library.posts.find((p) => !p.url);
  return (
    <group name="library">
      <LaneStrip paths={LIBRARY_LANES} />
      <BlogShelves posts={library.posts} labels={labels} />
      <Lectern post={featured} labels={labels} />
      <ResearchShelf research={library.research} labels={labels} />
      <ResearchShimmer />
      <PublicationsShelf publications={library.models} labels={labels} />
      <TalksStage talks={library.talks} labels={labels} />
    </group>
  );
}
