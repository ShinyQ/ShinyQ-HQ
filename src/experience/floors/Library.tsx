"use client";

import { LaneStrip } from "../fx/LaneStrip";
import type { LibraryData } from "../types";
import { LIBRARY_LANES } from "./library/layout";
import { BlogShelves, type ShelfLabels } from "./library/BlogShelves";
import { Lectern, PublicationsShelf, ResearchShelf, TalksStage, type ShowcaseLabels } from "./library/Showcase";

export type LibraryLabels = ShelfLabels & ShowcaseLabels;

/** L4 Library (appendix 01 section 5), generated from content. */
export function Library({ library, labels }: { library: LibraryData; labels: LibraryLabels }) {
  const featured = library.posts.find((p) => !p.url);
  return (
    <group name="library">
      <LaneStrip paths={LIBRARY_LANES} />
      <BlogShelves posts={library.posts} labels={labels} />
      <Lectern post={featured} labels={labels} />
      <ResearchShelf research={library.research} labels={labels} />
      <PublicationsShelf publications={library.models} labels={labels} />
      <TalksStage talks={library.talks} labels={labels} />
    </group>
  );
}
