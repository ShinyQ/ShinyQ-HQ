import type { FloorId, RoomId } from "@/content/schema";
import { SHAFT } from "@/experience/config";
import type { Interactable } from "@/experience/interact/registry";
import type { FloorLayout, Vec2 } from "@/experience/types";

/**
 * Minimap and overview model: a floor's roads, plazas, elevator and point-and-go targets in world
 * units, drawn north-up (SVG x = world x, SVG y = world z, so -z is up). Pure: no React, no three,
 * so the HUD minimap adds no draw call and Vitest runs it in node.
 */

export interface MapView {
  minX: number;
  minZ: number;
  width: number;
  depth: number;
}

export interface MapRoom {
  id: string;
  label: string;
  x: number;
  z: number;
  kind: Interactable["kind"];
  visited: boolean;
  room?: RoomId;
}

export interface FloorMap {
  floor: FloorId;
  /** Layout bounds plus the shaft, padded 2 u. */
  view: MapView;
  /** Walkable slab footprint (the backdrop, so a floor without roads still shows its shape). */
  slab: { x: number; z: number; w: number; d: number };
  /** SVG path data in world units (x right, z down: north-up). */
  roads: { d: string; width: number }[];
  /** Centers and sizes; `round` plazas are ellipses w x d. */
  plazas: { x: number; z: number; w: number; d: number; round: boolean }[];
  elevator: { x: number; z: number; size: number };
  /** De-duplicated by id, sorted west to east. */
  rooms: MapRoom[];
}

/** World units shown from the rover to the minimap edge. */
export const MINIMAP_RADIUS = 22;
/** Margin (u) around the floor in the overview. */
const PAD = 2;
/** Spur width (u) when the network gives none. */
const SPUR_WIDTH = 1.2;

export const MAP_ROOM_KINDS: readonly Interactable["kind"][] = ["door", "station", "board", "kiosk", "elevator-pad", "return-pad", "teleporter"];

/** Two decimals at most, so view boxes and paths stay short and stable. */
const n = (v: number) => String(Math.round(v * 100) / 100 + 0);

function path(points: readonly Vec2[], closed: boolean): string {
  const [first, ...rest] = points;
  const d = [`M ${n(first.x)} ${n(first.z)}`, ...rest.map((p) => `L ${n(p.x)} ${n(p.z)}`)].join(" ");
  return closed ? `${d} Z` : d;
}

export function buildFloorMap(layout: FloorLayout, items: readonly Interactable[], visited: readonly RoomId[]): FloorMap {
  const { bounds } = layout;
  const half = SHAFT.size / 2;
  const minX = Math.min(bounds.minX, SHAFT.x - half) - PAD;
  const maxX = Math.max(bounds.maxX, SHAFT.x + half) + PAD;
  const minZ = Math.min(bounds.minZ, SHAFT.z - half) - PAD;
  const maxZ = Math.max(bounds.maxZ, SHAFT.z + half) + PAD;

  const network = layout.road;
  const roads = [
    ...(network?.roads ?? []).filter((r) => r.points.length > 1).map((r) => ({ d: path(r.points, !!r.closed && r.points.length > 2), width: r.width })),
    ...(network?.spurs ?? []).map((s) => ({ d: path([s.from, s.to], false), width: s.width ?? SPUR_WIDTH })),
  ];
  const plazas = (network?.plazas ?? []).map((p) => ({ x: p.center.x, z: p.center.z, w: p.w, d: p.d, round: !!p.round }));

  const seen = new Set<string>();
  const rooms: MapRoom[] = [];
  for (const item of items) {
    if (!MAP_ROOM_KINDS.includes(item.kind) || seen.has(item.id)) continue;
    seen.add(item.id);
    const room = item.action.type === "open-room" ? item.action.room : undefined;
    rooms.push({ id: item.id, label: item.label, x: item.at.x, z: item.at.z, kind: item.kind, visited: room !== undefined && visited.includes(room), ...(room ? { room } : {}) });
  }
  rooms.sort((a, b) => a.x - b.x || a.z - b.z);

  return {
    floor: layout.id,
    view: { minX, minZ, width: maxX - minX, depth: maxZ - minZ },
    slab: { x: bounds.minX, z: bounds.minZ, w: bounds.maxX - bounds.minX, d: bounds.maxZ - bounds.minZ },
    roads,
    plazas,
    elevator: { x: SHAFT.x, z: SHAFT.z, size: SHAFT.size },
    rooms,
  };
}

/** SVG rotation (degrees) of an arrow drawn pointing to -z (map up) for a rover heading (0 faces +z). */
export function arrowRotation(heading: number): number {
  return 180 - (heading * 180) / Math.PI;
}

/** viewBox of a square window centred on the rover (minimap). */
export function windowBox(center: { x: number; z: number }, radius: number): string {
  return `${n(center.x - radius)} ${n(center.z - radius)} ${n(radius * 2)} ${n(radius * 2)}`;
}

/** viewBox of the whole floor (overview). */
export function floorBox(view: MapView): string {
  return `${n(view.minX)} ${n(view.minZ)} ${n(view.width)} ${n(view.depth)}`;
}
