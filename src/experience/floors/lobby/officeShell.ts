import { useEffect, useRef, type RefObject } from "react";
import { LinearFilter, SRGBColorSpace, Texture } from "three";
import { LOBBY } from "../../config";
import type { SignSpec } from "../../fx/signLayout";
import { distanceToRect } from "../../nav/collision";
import { roverRuntime } from "../../rover/runtime";
import type { Rect, Vec2 } from "../../types";
import type { Box } from "../roof/solids";
import { isOfficeRoom, OFFICE, officeDock, officeDockPad, officeObstacles, officeRiser, officeSlots, officeTower, officeTowerColumn, officeTowerYaw, officeZone, type OfficeSlot } from "./officeLayout";

/**
 * 3D-only Agent Office helpers (the Lobby, `OfficeMount` and the lazy chunk), placed in the wing `LOBBY.officeWing`.
 * Kept out of `officeLayout.ts`, which the Classic site's shared page chunk carries through the drawer bodies and the
 * office loader (`office/chunk.ts`), so they cost the Classic JS budget nothing (tests/unit/office-chunk-graph.test.ts).
 * The canvas helpers the lazy office scene uses live here too. The chip row's placement (anchors, sizes, fit, layout and
 * the near/far switch) lives in the office chunk only (`office/chipRows.ts`), off the first frame.
 */

/** The ten desks and Rovers in the wing: the front row (slots 0 to 4), then the back row on its riser (slots 5 to 9). */
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
const STOP_ZONE = officeZone(LOBBY.officeWing);
const STOP_AREA = STOP_ZONE.area;

/** Whether `at` (by default the rover's live position) stands in the office stop's view zone area. */
export function atOfficeStop(at: Vec2 = roverRuntime): boolean {
  return distanceToRect(at, STOP_AREA) === 0;
}

/**
 * Whether the office chips may show (`OfficeWatch`): only while the rover (by default its live position) is at the office
 * stop (its view zone area) or an office drawer is open. From the Lobby, the lead road and the rest of the wing the
 * office is a backdrop: a row of chips under the top bar would label Rovers far off in the distance.
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
 * ten desk tops (neighbours meet, one continuous console per row), two legs each, the back row's riser blocks (meeting at
 * their back edge), the wall frame, the CI tower's plinth and column (turned toward the stop) and the ship dock's pad.
 */
export function officeShellBoxes(): Box[] {
  const { desk, wall } = OFFICE;
  const w = LOBBY.officeWing;
  const out: Box[] = [];
  for (const s of OFFICE_SLOTS) {
    out.push({ x: s.desk.x, y: s.lift + desk.top - desk.slab, z: s.desk.z, w: s.deskW, h: desk.slab, d: desk.d, yaw: s.yaw });
    for (const side of [-1, 1]) {
      // Local x is (cos yaw, -sin yaw) in floor x and z.
      const off = side * (s.deskW / 2 - 0.2);
      out.push({ x: s.desk.x + off * Math.cos(s.yaw), y: s.lift, z: s.desk.z - off * Math.sin(s.yaw), w: desk.leg, h: desk.top - desk.slab, d: desk.d * 0.8, yaw: s.yaw });
    }
  }
  for (const s of OFFICE_SLOTS) {
    const riser = officeRiser(w, OFFICE.rows[s.row], s.theta);
    if (riser) out.push({ x: riser.center.x, y: 0, z: riser.center.z, w: riser.w, h: s.lift, d: riser.d, yaw: riser.yaw });
  }
  out.push({ x: w.wall.x, y: 0, z: w.wall.z, w: wall.w + 2 * wall.frame, h: wall.bottom + wall.h + wall.frame, d: wall.t });
  const tower = officeTower(w);
  const dock = officeDock(w);
  const col = officeTowerColumn(w);
  const pad = officeDockPad(w);
  out.push({ x: (tower.minX + tower.maxX) / 2, y: 0, z: (tower.minZ + tower.maxZ) / 2, w: tower.maxX - tower.minX, h: OFFICE.tower.plinth, d: tower.maxZ - tower.minZ });
  out.push({ x: col.x, y: OFFICE.tower.plinth, z: col.z, w: OFFICE.tower.column, h: OFFICE.tower.h, d: OFFICE.tower.column, yaw: officeTowerYaw(w) });
  out.push({ x: pad.x, y: 0, z: pad.z, w: dock.maxX - dock.minX, h: OFFICE.dock.pad, d: dock.maxZ - dock.minZ });
  return out;
}

/**
 * How the chips show (`OfficeWatch`) where `officeChipsHere` lets them: "full" (the name far, the activity near) once the
 * camera holds the office view (`roverRuntime.cameraView` is the stop's zone and `cameraHeld`); null (hidden) while that
 * view is applied but the camera has not come to rest in it yet (arriving from the plain follow view, so the row and its
 * leader lines do not slide across the screen as the camera swings in, or a device rotation); "compact" (state
 * dots, `OfficeChips`) when the office view is not applied at all: reduced motion, a hand turn or drag inside the zone,
 * first person, or an office drawer open away from the stop. Once held, a hand zoom (a held look offset) or the rover moving
 * inside the zone keeps the chips shown; a portrait screen's hand zoom retargets its look offset, so its chips wait again
 * (tests/unit/office-chip-placement.test.ts).
 */
export function officeChipMode(room: string | null, at: Vec2 = roverRuntime, view = roverRuntime.cameraView, held = roverRuntime.cameraHeld): "full" | "compact" | null {
  if (!officeChipsHere(room, at)) return null;
  if (view !== STOP_ZONE.id) return "compact";
  return held ? "full" : null;
}

/** A site font for canvas text: the CSS variable's value, then `fallback`. */
function cssFont(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

/** Reads the site fonts for canvas text (the office atlas and wall), again once web fonts are ready (then `onReady` forces a redraw). */
export function useCanvasFonts(onReady: () => void): RefObject<{ mono: string; sans: string }> {
  const fonts = useRef({ mono: "monospace", sans: "sans-serif" });
  useEffect(() => {
    const read = () => {
      fonts.current.mono = cssFont("--font-jetbrains", "monospace");
      fonts.current.sans = cssFont("--font-inter", "sans-serif");
      onReady();
    };
    read();
    void document.fonts?.ready.then(read);
  }, [onReady]);
  return fonts;
}

/**
 * A texture on a fresh `w` x `h` canvas that is only ever drawn whole or patched: no mipmaps, linear filtering
 * (performance review). `Kind` is `Texture` (uploaded once primed) or `CanvasTexture` (uploaded at once).
 */
export function canvasTexture(w: number, h: number, Kind: new (canvas: HTMLCanvasElement) => Texture = Texture): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const texture = new Kind(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}
