import { LOBBY } from "../../config";
import type { SignSpec } from "../../fx/signLayout";
import { distanceToRect } from "../../nav/collision";
import { roverRuntime } from "../../rover/runtime";
import type { Rect, Vec2 } from "../../types";
import type { Box } from "../roof/solids";
import { isOfficeRoom, OFFICE, officeObstacles, officeSlots, officeZone, type OfficeSlot } from "./officeLayout";

/**
 * 3D-only Agent Office helpers (the Lobby, `OfficeMount` and the lazy chunk), placed in the wing `LOBBY.officeWing`.
 * Kept out of `officeLayout.ts`, which the Classic site's shared page chunk carries through the drawer bodies and the
 * office loader (`office/chunk.ts`), so they cost the Classic JS budget nothing (tests/unit/office-chunk-graph.test.ts).
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

/** The office stop's view zone area (`L1:office`, `officeZone`): the chips show and the wing sign fades out in it. */
const STOP_AREA = officeZone(LOBBY.officeWing).area;

/** Whether `at` (by default the rover's live position) stands in the office stop's view zone area. */
export function atOfficeStop(at: Vec2 = roverRuntime): boolean {
  return distanceToRect(at, STOP_AREA) === 0;
}

/**
 * Whether the office chips may show (`OfficeWatch`): only while the rover (by default its live position) is at the office
 * stop (its view zone area) or an office drawer is open. From the Lobby, the lead road and the rest of the wing the
 * camera is not in the office view yet: the far chips clamp into one row under the HUD's top bar over each other, and on
 * a phone run under the minimap (tests/unit/office-chip-placement.test.ts).
 */
export function officeChipsHere(room: string | null, at: Vec2 = roverRuntime): boolean {
  return isOfficeRoom(room) || atOfficeStop(at);
}

/**
 * Whether the wing sign hides (`Lobby`, faded like the ghost outline): while the rover is on L1 at the office stop, where
 * the plate would stand in the foreground of the office view (large on a desktop screen). It shows everywhere else,
 * the lead road and the rest of the wing included.
 */
export function wingSignHidden(floor: string, at: Vec2 = roverRuntime): boolean {
  return floor === "L1" && atOfficeStop(at);
}

/**
 * The floating wing sign over the wing plaza's centre (the shared `FloatingSigns`; nothing on the floor), low enough
 * that the rover still drives under it. No spot over the lead road keeps the plate whole in every frame it shows up
 * in, so it stands where it does (tests/unit/office-chip-placement.test.ts): from the primed spawn it is whole on the
 * landscape screens and out of the portrait ones (never a sliver at an edge), and on the lead road it reads ahead of
 * the rover. At the office stop, where it would stand whole in the foreground, it fades out (`wingSignHidden`).
 */
export function officeSign(text: string, color: string): SignSpec {
  const { lead, plaza } = LOBBY.officeWing;
  return { text: text.toUpperCase(), x: lead.x, y: 4.5, z: plaza.center.z, color, fontSize: 0.75, letterSpacing: 0.08 };
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
