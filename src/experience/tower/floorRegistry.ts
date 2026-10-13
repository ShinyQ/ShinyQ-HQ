import type { Group } from "three";
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
