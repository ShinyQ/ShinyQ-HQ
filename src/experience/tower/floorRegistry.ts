import type { Group, Mesh } from "three";
import type { FloorId } from "@/content/schema";

/** Name of each floor component's root group (Lobby, CareerArchive, Labs, Library, Roof). */
export const FLOOR_ROOT: Record<FloorId, string> = { L1: "lobby", L2: "career-archive", L3: "labs", L4: "library", RF: "roof" };

const groups = new Map<FloorId, Group>();

/** FloorLevel registers its content group (always present; children only while the floor is near). */
export function registerFloorContent(id: FloorId, group: Group | null): void {
  if (group) groups.set(id, group);
  else groups.delete(id);
}

export function getFloorContent(id: FloorId): Group | null {
  return groups.get(id) ?? null;
}

const slabs = new Map<FloorId, Mesh>();

/** FloorLevel registers its slab fill mesh: the occluder the ride cull tests against (rideCull.ts). */
export function registerFloorSlab(id: FloorId, mesh: Mesh | null): void {
  if (mesh) slabs.set(id, mesh);
  else slabs.delete(id);
}

export function getFloorSlab(id: FloorId): Mesh | null {
  return slabs.get(id) ?? null;
}
