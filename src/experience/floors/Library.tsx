"use client";

import type { LibraryData } from "../types";
import { BlogShelves, type ShelfLabels } from "./library/BlogShelves";
import { Lectern, PublicationsShelf, TalksStage, type ShowcaseLabels } from "./library/Showcase";

export type LibraryLabels = ShelfLabels & ShowcaseLabels;

/** L4 Library (appendix 01 section 5), generated from content. */
export function Library({ library, labels }: { library: LibraryData; labels: LibraryLabels }) {
  const featured = library.posts.find((p) => !p.url);
  return (
    <group name="library">
      <BlogShelves posts={library.posts} labels={labels} />
      <Lectern post={featured} labels={labels} />
      <PublicationsShelf publications={library.publications} labels={labels} />
      <TalksStage talks={library.talks} labels={labels} />
    </group>
  );
}
