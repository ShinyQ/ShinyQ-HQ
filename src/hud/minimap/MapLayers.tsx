"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Accent, FloorId } from "@/content/schema";
import { interactRuntime } from "@/experience/interact/runtime";
import type { Interactable } from "@/experience/interact/registry";
import type { FloorLayouts } from "@/experience/types";
import { FLOOR_ACCENT } from "@/lib/accent";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { arrowRotation, buildFloorMap, type FloorMap } from "./model";

/** SVG fills per accent (static, like the Tailwind class maps). */
const ACCENT_FILL: Record<Accent, string> = {
  violet: "var(--color-violet)",
  pink: "var(--color-pink)",
  green: "var(--color-green)",
  amber: "var(--color-amber)",
  cyan: "var(--color-cyan)",
  blue: "var(--color-blue)",
  white: "var(--color-white)",
};

/**
 * `interactRuntime` is not reactive: InteractLayer replaces `items` when the floor's targets change.
 * The store changes on every floor change, ride stage and rover move (the 10 Hz mirror), so its
 * listener re-reads the list, and a re-render only follows when the list itself was replaced.
 */
const subscribeItems = (onChange: () => void) => getHQStore().subscribe(onChange);
const itemsSnapshot = () => interactRuntime.items;

/** The current floor's point-and-go targets (labels already localized). */
function useFloorItems(floor: FloorId): readonly Interactable[] {
  const source = useSyncExternalStore(subscribeItems, itemsSnapshot, itemsSnapshot);
  return useMemo(() => source.filter((i) => i.floor === floor), [source, floor]);
}

/** The current floor's map: layout, point-and-go rooms and visited state. */
export function useFloorMap(layouts: FloorLayouts): FloorMap {
  const floor = useHQStore((s) => s.floor);
  const visited = useHQStore((s) => s.visited);
  const items = useFloorItems(floor);
  const layout = layouts[floor];
  return useMemo(() => buildFloorMap(layout, items, visited), [layout, items, visited]);
}

/**
 * The map's shapes in world units (north-up): the slab, roads and plazas, the elevator shaft, room
 * dots in the floor accent (visited ones dimmed), optional labels and the rover arrow. Strokes that
 * must stay crisp at any zoom use `non-scaling-stroke`.
 */
export function MapLayers({ map, labels = false, roomRadius }: { map: FloorMap; labels?: boolean; roomRadius: number }) {
  const rover = useHQStore((s) => s.rover);
  const fill = ACCENT_FILL[FLOOR_ACCENT[map.floor]];
  const { elevator: e, slab } = map;
  return (
    <>
      <rect x={slab.x} y={slab.z} width={slab.w} height={slab.d} rx={1.5} fill="var(--color-surface-2)" stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <g opacity={0.6}>
        {map.plazas.map((p, i) =>
          p.round ? (
            <ellipse key={i} cx={p.x} cy={p.z} rx={p.w / 2} ry={p.d / 2} fill="var(--color-line-2)" />
          ) : (
            <rect key={i} x={p.x - p.w / 2} y={p.z - p.d / 2} width={p.w} height={p.d} fill="var(--color-line-2)" />
          ),
        )}
        {map.roads.map((r, i) => (
          <path key={i} d={r.d} fill="none" stroke="var(--color-line-2)" strokeWidth={r.width} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </g>
      <rect data-map="elevator" x={e.x - e.size / 2} y={e.z - e.size / 2} width={e.size} height={e.size} fill="none" stroke="var(--color-cyan)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {map.rooms.map((r) => (
        <g key={r.id}>
          <circle data-map="room" cx={r.x} cy={r.z} r={roomRadius} fill={fill} className={r.visited ? "opacity-40" : undefined} />
          {labels && (
            <text x={r.x} y={r.z + roomRadius + 1.6} fontSize={1.4} textAnchor="middle" fill="var(--color-ink-2)" className={r.visited ? "opacity-60" : undefined}>
              {r.label}
            </text>
          )}
        </g>
      ))}
      <path data-map="rover" d="M 0 -1.8 L 1.3 1.4 L 0 0.7 L -1.3 1.4 Z" fill="var(--color-cyan)" stroke="var(--color-void)" strokeWidth={0.3} transform={`translate(${rover.x} ${rover.z}) rotate(${Math.round(arrowRotation(rover.heading) * 10) / 10})`} />
    </>
  );
}
