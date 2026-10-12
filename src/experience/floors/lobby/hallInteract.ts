import type { Interactable } from "../../interact/registry";
import { padHalf } from "../../nav/doors";
import type { Rect } from "../../types";
import { HALL, type HallStation, type HighlightsHallLayout } from "./hallLayout";
import type { HighlightStation } from "./stations";

/** The station panel plus its door pad (doors face along x or z), so pointing at either picks it. */
function stationBounds(s: HallStation): Rect {
  const { along, across } = padHalf({ room: s.room, at: s.pad, facing: s.facing });
  const hx = Math.abs(s.facing.x) * along + Math.abs(s.facing.z) * across;
  const hz = Math.abs(s.facing.z) * along + Math.abs(s.facing.x) * across;
  return {
    minX: Math.min(s.rect.minX, s.pad.x - hx),
    maxX: Math.max(s.rect.maxX, s.pad.x + hx),
    minZ: Math.min(s.rect.minZ, s.pad.z - hz),
    maxZ: Math.max(s.rect.maxZ, s.pad.z + hz),
  };
}

/**
 * The four Highlights Hall stations as point-and-go targets (R4-I registry): a click drives along the
 * hall road to the door pad and opens the station's drawer. `labels` are the resolved station names.
 * Ids follow the registry rule (`L1:station:highlights-<station>`, like `L1:station:profile`).
 */
export function highlightsInteractables(hall: HighlightsHallLayout, labels: Record<HighlightStation, string>): Interactable[] {
  return hall.stations.map(
    (s): Interactable => ({
      id: `L1:station:${s.room.slice(3)}`,
      floor: "L1",
      kind: "station",
      label: labels[s.station],
      at: { x: s.pad.x, z: s.pad.z },
      bounds: stationBounds(s),
      height: HALL.panel.h,
      action: { type: "open-room", room: s.room },
    }),
  );
}
