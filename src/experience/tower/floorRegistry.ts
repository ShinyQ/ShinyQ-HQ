import type { Group, Mesh } from "three";
import type { FloorId } from "@/content/schema";

/** Name of each floor component's root group (Lobby, CareerArchive, Labs, Library, Roof). */
export const FLOOR_ROOT: Record<FloorId, string> = { B1: "engine-room", L1: "lobby", L2: "career-archive", L3: "labs", L4: "library", RF: "roof" };

const groups = new Map<FloorId, Group>();

/** FloorLevel registers its content group (always present; children only while the floor is near). */
export function registerFloorContent(id: FloorId, group: Group | null): void {
  if (group) groups.set(id, group);
  else groups.delete(id);
}

export function getFloorContent(id: FloorId): Group | null {
  return groups.get(id) ?? null;
}

const slabs = new Map<FloorId, readonly Mesh[]>();
const NONE: readonly Mesh[] = [];

/** FloorLevel registers its slab fill meshes (the main rect first, then each wing): the occluders the ride cull tests against (rideCull.ts). */
export function registerFloorSlab(id: FloorId, meshes: readonly Mesh[] | null): void {
  if (meshes?.length) slabs.set(id, meshes);
  else slabs.delete(id);
}

export function getFloorSlabs(id: FloorId): readonly Mesh[] {
  return slabs.get(id) ?? NONE;
}
