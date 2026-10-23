import { buildNewsroomLayout as buildPicked } from "./concepts/newsroom";
import type { LibraryConcept, LibraryLayout, LibraryLayoutInput } from "./model";

/**
 * L4 Writing (walkable floors plan, part 3). The owner picked the newsroom concept from a dev
 * prototype; the other concepts and the prototype are gone. Pure.
 */
export const LIBRARY_CONCEPT: LibraryConcept = "newsroom";

const EMPTY: LibraryLayoutInput = { posts: [], research: 0, models: 0, talks: 0, guides: [] };

/**
 * The real L4 floor: the picked concept's layout, with `floor.listStop` set so rooms without a door
 * (posts on the archive board) drive to the board, or to the overview spot when every post is docked.
 */
export function buildLibraryLayout(input: LibraryLayoutInput = EMPTY): LibraryLayout {
  const layout = buildPicked(input);
  return { ...layout, floor: { ...layout.floor, listStop: layout.board?.stop ?? layout.floor.spawn } };
}
