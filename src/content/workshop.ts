import type { RoomId } from "./schema";

/**
 * L2 Workshop rooms (F3): one drawer per side project and per public repo, next to the Workshop
 * overview. Pure and client safe (no zod, no dataset): the server builds the views and the catalog,
 * the 3D chunk builds the point-and-go targets with the same ids.
 */
export const WORKSHOP_ROOM: RoomId = "L2:workshop";

/** A repo name as a room slug: "Python_Kampus-Merdeka" to "python-kampus-merdeka". */
export function repoSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const sideProjectRoom = (id: string): RoomId => `L2:side-${id}`;
export const repoRoom = (slug: string): RoomId => `L2:repo-${slug}`;

/**
 * Side projects that moved to full L3 Data and ML pods (owner decision 2026-10-14): their bench rooms
 * are gone, and an old `L2:side-<id>` id (history entries, saved links) goes to the pod instead.
 */
export const RETIRED_SIDE_ROOMS: Readonly<Record<string, RoomId>> = {
  "L2:side-sentiboard": "L3:university-sentiment-indobert",
  "L2:side-ewallet-sentiment": "L3:ifest-2021-sentiment-analysis",
  "L2:side-sp500-portfolio-optimizer": "L3:stock-allocation-optimizer",
};

/** The room an id stands for today: a retired side project bench resolves to its L3 pod. */
export const currentRoom = (room: RoomId): RoomId => RETIRED_SIDE_ROOMS[room] ?? room;
