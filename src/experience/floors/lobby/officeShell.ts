import { LOBBY } from "../../config";
import type { SignSpec } from "../../fx/signLayout";
import type { Rect } from "../../types";
import type { Box } from "../roof/solids";
import { OFFICE, officeObstacles, officeSlots, type OfficeSlot } from "./officeLayout";

/**
 * 3D-only Agent Office helpers (the Lobby, `OfficeMount` and the lazy chunk), placed in the wing `LOBBY.officeWing`.
 * Kept out of `officeLayout.ts`, which the Classic site's shared page chunk carries through `useHQStore` and
 * config.ts, so they cost the Classic JS budget nothing (tests/unit/office-chunk-graph.test.ts).
 */

/** The five desks and Rovers in the wing. */
export const OFFICE_SLOTS: readonly OfficeSlot[] = officeSlots(LOBBY.officeWing);

/** Everything the office covers: the in-view test. */
export function officeBounds(): Rect {
  const rects = officeObstacles(LOBBY.officeWing);
  return {
    minX: Math.min(...rects.map((r) => r.minX)),
    maxX: Math.max(...rects.map((r) => r.maxX)),
    minZ: Math.min(...rects.map((r) => r.minZ)),
    maxZ: Math.max(...rects.map((r) => r.maxZ)),
  };
}

/** The intro reveal rect of the wing: the wing slab reaching north over the lead road's span in the Lobby (the wing is wider than the road). */
export function wingBounds(): Rect {
  const { rect, lead } = LOBBY.officeWing;
  return { ...rect, minZ: lead.from };
}

/**
 * The floating wing sign over the lead road where it enters the wing (the shared `FloatingSigns`; nothing on the
 * floor), as high as the hall's gate sign, so the follow camera sees the rover under it.
 */
export function officeSign(text: string, color: string): SignSpec {
  const { lead, rect } = LOBBY.officeWing;
  return { text: text.toUpperCase(), x: lead.x, y: 8.1, z: rect.minZ, color, fontSize: 0.75, letterSpacing: 0.08 };
}

/**
 * The furniture drawn on the main path (so the obstacles always show, before the chunk and if it fails):
 * five desk tops (neighbours meet, one continuous console), two legs each, and the wall frame.
 */
export function officeShellBoxes(): Box[] {
  const { desk, wall } = OFFICE;
  const w = LOBBY.officeWing;
  const out: Box[] = [];
  for (const s of OFFICE_SLOTS) {
    out.push({ x: s.desk.x, y: desk.top - desk.slab, z: s.desk.z, w: desk.w, h: desk.slab, d: desk.d, yaw: s.yaw });
    for (const side of [-1, 1]) {
      // Local x is (cos yaw, -sin yaw) in floor x and z.
      const off = side * (desk.w / 2 - 0.2);
      out.push({ x: s.desk.x + off * Math.cos(s.yaw), y: 0, z: s.desk.z - off * Math.sin(s.yaw), w: desk.leg, h: desk.top - desk.slab, d: desk.d * 0.8, yaw: s.yaw });
    }
  }
  out.push({ x: w.wall.x, y: 0, z: w.wall.z, w: wall.w + 2 * wall.frame, h: wall.bottom + wall.h + wall.frame, d: wall.t });
  return out;
}
