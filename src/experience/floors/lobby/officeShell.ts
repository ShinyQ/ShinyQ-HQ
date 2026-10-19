import type { Rect } from "../../types";
import type { Box } from "../roof/solids";
import { OFFICE, officeObstacles, officeSlots, onArc } from "./officeLayout";

/**
 * 3D-only Agent Office helpers (the Lobby, `OfficeMount` and the lazy chunk). Kept out of `officeLayout.ts`, which
 * the Classic site's shared page chunk carries through `useHQStore` and config.ts, so they cost the Classic JS
 * budget nothing (tests/unit/office-chunk-graph.test.ts).
 */

/** Everything the office covers: the intro reveal rect and the in-view test. */
export function officeBounds(): Rect {
  const rects = officeObstacles();
  return {
    minX: Math.min(...rects.map((r) => r.minX)),
    maxX: Math.max(...rects.map((r) => r.maxX)),
    minZ: Math.min(...rects.map((r) => r.minZ)),
    maxZ: Math.max(...rects.map((r) => r.maxZ)),
  };
}

/**
 * The furniture drawn on the main path (so the obstacles always show, before the chunk and if it fails):
 * five desk tops, two legs each, four cable trays along the arc between the desks, and the wall frame.
 */
export function officeShellBoxes(): Box[] {
  const { desk, wall } = OFFICE;
  const out: Box[] = [];
  const slots = officeSlots();
  for (const s of slots) {
    out.push({ x: s.desk.x, y: desk.top - desk.slab, z: s.desk.z, w: desk.w, h: desk.slab, d: desk.d, yaw: s.yaw });
    for (const side of [-1, 1]) {
      // Local x is (cos yaw, -sin yaw) in floor x and z.
      const off = side * (desk.w / 2 - 0.2);
      out.push({ x: s.desk.x + off * Math.cos(s.yaw), y: 0, z: s.desk.z - off * Math.sin(s.yaw), w: desk.leg, h: desk.top - desk.slab, d: desk.d * 0.8, yaw: s.yaw });
    }
  }
  for (let i = 0; i + 1 < slots.length; i++) {
    const a = slots[i].theta;
    const b = slots[i + 1].theta;
    const mid = (a + b) / 2;
    const at = onArc(mid, OFFICE.deskRadius);
    const chord = 2 * OFFICE.deskRadius * Math.sin(Math.abs(b - a) / 2);
    out.push({ x: at.x, y: 0, z: at.z, w: chord - desk.w + 0.2, h: 0.06, d: 0.3, yaw: mid + Math.PI });
  }
  out.push({ x: wall.x, y: 0, z: wall.z, w: wall.w + 2 * wall.frame, h: wall.bottom + wall.h + wall.frame, d: wall.t });
  return out;
}
