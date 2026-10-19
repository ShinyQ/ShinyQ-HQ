"use client";

import { memo, useMemo, useSyncExternalStore } from "react";
import type { Accent, FloorId } from "@/content/schema";
import { interactRuntime } from "@/experience/interact/runtime";
import type { Interactable } from "@/experience/interact/registry";
import type { FloorLayouts } from "@/experience/types";
import { FLOOR_ACCENT } from "@/lib/accent";
import { useHQStore } from "@/store/useHQStore";
import { arrowRotation, buildFloorMap, labelAnchor, labelsDoors, RING_WIDTH, type FloorMap } from "./model";

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

/** `interactRuntime.setItems` (InteractLayer, extras) notifies; the floor itself comes from the store. */
const subscribeItems = (onChange: () => void) => interactRuntime.subscribe(onChange);
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
export function MapLayers({ map, labels = false, roomRadius, arrowScale }: { map: FloorMap; labels?: boolean; roomRadius: number; arrowScale: number }) {
  return (
    <>
      <StaticLayers map={map} labels={labels} roomRadius={roomRadius} />
      <RoverArrow scale={arrowScale} />
    </>
  );
}

/** Only the arrow follows the 10 Hz rover mirror; the floor shapes re-render when the map changes. */
function RoverArrow({ scale }: { scale: number }) {
  const rover = useHQStore((s) => s.rover);
  return <path data-map="rover" d="M 0 -1.8 L 1.3 1.4 L 0 0.7 L -1.3 1.4 Z" fill="var(--color-cyan)" stroke="var(--color-void)" strokeWidth={0.3} transform={`translate(${rover.x} ${rover.z}) rotate(${Math.round(arrowRotation(rover.heading) * 10) / 10}) scale(${scale})`} />;
}

const StaticLayers = memo(function StaticLayers({ map, labels, roomRadius }: { map: FloorMap; labels: boolean; roomRadius: number }) {
  const fill = ACCENT_FILL[FLOOR_ACCENT[map.floor]];
  const { elevator: e, slab } = map;
  const doorLabels = labels && labelsDoors(map.rooms);
  return (
    <>
      {map.outline ? (
        <g data-map="slab">
          <path d={map.area} fill="var(--color-surface-2)" />
          <path d={map.outline} fill="none" stroke="var(--color-line)" strokeWidth={1} strokeLinecap="square" vectorEffect="non-scaling-stroke" />
        </g>
      ) : (
        <rect x={slab[0].x} y={slab[0].z} width={slab[0].w} height={slab[0].d} rx={1.5} fill="var(--color-surface-2)" stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
      <g fill="var(--color-ink-3)" opacity={0.18}>
        {map.fixtures.map((f, i) => (
          <rect key={i} x={f.x} y={f.z} width={f.w} height={f.d} />
        ))}
      </g>
      <g opacity={0.35} fill={fill} stroke={fill}>
        {map.plazas.map((p, i) =>
          p.round ? <ellipse key={i} cx={p.x} cy={p.z} rx={p.w / 2} ry={p.d / 2} stroke="none" /> : <rect key={i} x={p.x - p.w / 2} y={p.z - p.d / 2} width={p.w} height={p.d} stroke="none" />,
        )}
        {map.rings.map((r, i) => (
          <circle key={i} cx={r.x} cy={r.z} r={r.r} fill="none" strokeWidth={RING_WIDTH} />
        ))}
        {map.roads.map((r, i) => (
          <path key={i} d={r.d} fill="none" strokeWidth={r.width} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </g>
      <rect data-map="elevator" x={e.x - e.size / 2} y={e.z - e.size / 2} width={e.size} height={e.size} fill="none" stroke="var(--color-cyan)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {map.rooms.map((r) => (
        <g key={r.id}>
          <circle data-map="room" cx={r.x} cy={r.z} r={roomRadius} fill={fill} className={r.visited ? "opacity-40" : undefined} />
          {labels && (doorLabels || (r.kind !== "door" && r.kind !== "teleporter")) && (
            <text x={r.x} y={r.z + roomRadius + 1.6} fontSize={1.4} textAnchor={labelAnchor(r.x, map.view)} fill="var(--color-ink-2)" className={r.visited ? "opacity-60" : undefined}>
              {r.label}
            </text>
          )}
        </g>
      ))}
    </>
  );
});
