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

/** True for the Workshop overview and its side project and repo rooms. */
export function isWorkshopRoom(room: string): boolean {
  return room === WORKSHOP_ROOM || room.startsWith("L2:side-") || room.startsWith("L2:repo-");
}
