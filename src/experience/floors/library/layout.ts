import { buildNewsroomLayout as buildPicked } from "./concepts/newsroom";
import type { LibraryConcept, LibraryLayout, LibraryLayoutInput } from "./model";

/**
 * L4 Writing (walkable floors plan, part 3). The owner picked the newsroom concept from a dev
 * prototype; the other concepts and the prototype are gone. Pure.
 */
export const LIBRARY_CONCEPT: LibraryConcept = "newsroom";

const EMPTY: LibraryLayoutInput = { posts: [], tracks: [], research: 0, models: 0, talks: 0, guides: [] };

/**
 * The real L4 floor: the picked concept's layout, with `floor.listStop` set so rooms without a door or a
 * stop (a post on no track) drive to the featured stage, or to the overview spot without a hosted post.
 */
export function buildLibraryLayout(input: LibraryLayoutInput = EMPTY): LibraryLayout {
  const layout = buildPicked(input);
  const stage = layout.stations[0]?.zone === "blog" ? layout.stations[0] : null;
  return { ...layout, floor: { ...layout.floor, listStop: stage ? stage.door : layout.floor.spawn } };
}
