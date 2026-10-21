import { useEffect, useRef, type RefObject } from "react";
import { LinearFilter, SRGBColorSpace, Texture } from "three";
import { LOBBY } from "../../config";
import type { SignSpec } from "../../fx/signLayout";
import { distanceToRect } from "../../nav/collision";
import { roverRuntime } from "../../rover/runtime";
import type { Rect, Vec2 } from "../../types";
import type { ScreenBox } from "../../fx/labelPlacement";
import type { Box } from "../roof/solids";
import { isOfficeRoom, OFFICE, officeDock, officeDockPad, officeObstacles, officeSlots, officeTower, officeTowerColumn, officeTowerYaw, officeZone, type OfficeSlot } from "./officeLayout";

/**
 * 3D-only Agent Office helpers (the Lobby, `OfficeMount` and the lazy chunk), placed in the wing `LOBBY.officeWing`.
 * Kept out of `officeLayout.ts`, which the Classic site's shared page chunk carries through the drawer bodies and the
 * office loader (`office/chunk.ts`), so they cost the Classic JS budget nothing (tests/unit/office-chunk-graph.test.ts).
 * The chip placement constants and the canvas helpers the lazy office scene uses live here too: the main path carries
 * them, so the office chunk stays under its byte cap.
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
 * five desk tops (neighbours meet, one continuous console), two legs each, the wall frame, the CI tower's plinth and
 * column (turned toward the stop) and the ship dock's pad.
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
  const tower = officeTower(w);
  const dock = officeDock(w);
  const col = officeTowerColumn(w);
  const pad = officeDockPad(w);
  out.push({ x: (tower.minX + tower.maxX) / 2, y: 0, z: (tower.minZ + tower.maxZ) / 2, w: tower.maxX - tower.minX, h: OFFICE.tower.plinth, d: tower.maxZ - tower.minZ });
  out.push({ x: col.x, y: OFFICE.tower.plinth, z: col.z, w: OFFICE.tower.column, h: OFFICE.tower.h, d: OFFICE.tower.column, yaw: officeTowerYaw(w) });
  out.push({ x: pad.x, y: 0, z: pad.z, w: dock.maxX - dock.minX, h: OFFICE.dock.pad, d: dock.maxZ - dock.minZ });
  return out;
}

/** The top of an office Rover's head over the floor (u; `OFFICE_ROVER.head`, kept here off the scene chunk's module). */
export const OFFICE_ROVER_HEAD_TOP = 1.95;

/**
 * The chips' world anchors, one per slot: the top of each Rover's head. Each chip in the row under the top bar centres on
 * its anchor's screen x (nudged by `layoutChipRow`), and its leader line ends there.
 */
export const OFFICE_CHIP_ANCHORS = OFFICE_SLOTS.map((s) => ({ x: s.rover.x, y: OFFICE_ROVER_HEAD_TOP, z: s.rover.z }));

/** The chip row's top (px): right under the HUD's top bar (62 px from 768 px wide, 58 px on a narrower phone). */
export const OFFICE_CHIP_TOP = { desktop: 66, mobile: 64 } as const;

/**
 * The pinned chip row (px): `gap` between neighbours, `edge` from the screen edges and the HUD boxes, `max` the widest
 * chip (its inline max width; where five would not fit the row the chips keep one line, `chipsOneLine`), `band` the row's
 * height the HUD boxes are tested against (a near chip with its CI bar is 40 px), `lead` the shortest leader line drawn.
 */
export const CHIP_ROW = { gap: 6, edge: 8, max: 176, band: 44, lead: 8 } as const;

/**
 * The HUD boxes the chip row and the leader lines keep off (px, measured in the browser): the desktop profile card (top
 * left) and floor menu panel (right, 219 by 284 px, centred), the Corners minimap (top right: phones 72 px at top 64,
 * 12 px in; tablets 112 px at top 76, 16 px in) and joystick (bottom left, 160 by 144 px). The top bar is above the row.
 */
export function officeHudBoxes(width: number, height: number, hud: "desktop" | "tablet" | "phone"): ScreenBox[] {
  if (hud === "desktop")
    return [
      { x0: 16, y0: 16, x1: 296, y1: 153 },
      { x0: width - 235, y0: (height - 284) / 2, x1: width - 16, y1: (height + 284) / 2 },
    ];
  const minimap = hud === "phone" ? { x0: width - 84, y0: 64, x1: width - 12, y1: 136 } : { x0: width - 128, y0: 76, x1: width - 16, y1: 188 };
  return [minimap, { x0: 0, y0: height - 144, x1: 160, y1: height }];
}

/**
 * Whether the segment from (x0, y0) to (x1, y1) runs through the inside of box `b` (its edges excluded, px): a leader line
 * is drawn only while it crosses no HUD box (`OfficeWatch`, tests/unit/office-chip-placement.test.ts). Clips the segment's
 * parameter to the box one axis at a time; allocates nothing.
 */
export function segmentHitsBox(x0: number, y0: number, x1: number, y1: number, b: ScreenBox): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx === 0) {
    if (x0 <= b.x0 || x0 >= b.x1) return false;
  } else {
    const a = (b.x0 - x0) / dx;
    const c = (b.x1 - x0) / dx;
    t0 = Math.max(t0, Math.min(a, c));
    t1 = Math.min(t1, Math.max(a, c));
  }
  if (dy === 0) {
    if (y0 <= b.y0 || y0 >= b.y1) return false;
  } else {
    const a = (b.y0 - y0) / dy;
    const c = (b.y1 - y0) / dy;
    t0 = Math.max(t0, Math.min(a, c));
    t1 = Math.min(t1, Math.max(a, c));
  }
  return t0 < t1;
}

/** The x span the chip row may use (px). */
export interface ChipRowBounds {
  left: number;
  right: number;
}

/**
 * The row's span on a `width` px screen with its top at `top`: `CHIP_ROW.edge` inside the screen edges, trimmed past every
 * HUD box in the row's band (`top` to `top + CHIP_ROW.band`): a box in the left half moves the left bound past its right
 * edge, one in the right half the right bound before its left edge (the profile card, the minimap). Writes `out`.
 */
export function chipRowBounds(width: number, top: number, boxes: readonly ScreenBox[], out: ChipRowBounds = { left: 0, right: 0 }): ChipRowBounds {
  out.left = CHIP_ROW.edge;
  out.right = width - CHIP_ROW.edge;
  for (const b of boxes) {
    if (b.y0 >= top + CHIP_ROW.band || b.y1 <= top) continue;
    if (b.x0 + b.x1 < width) out.left = Math.max(out.left, b.x1 + CHIP_ROW.edge);
    else out.right = Math.min(out.right, b.x0 - CHIP_ROW.edge);
  }
  return out;
}

/** The widest `n` chips may be to fit the row side by side (px, at most `CHIP_ROW.max`). */
export const chipMaxWidth = (bounds: ChipRowBounds, n: number): number => Math.max(32, Math.min(CHIP_ROW.max, Math.floor((bounds.right - bounds.left - (n - 1) * CHIP_ROW.gap) / n)));

/**
 * Whether the chips keep one line (the name) at any distance (`OfficeWatch`): on a phone (`viewport` "mobile", where they
 * are dots), outside the office view (`compact`), and where five chips `CHIP_ROW.max` px wide would not fit the row side
 * by side (`max`, `chipMaxWidth`: the tablet camera's 960 x 640, a portrait tablet), so the activity never ends in an
 * ellipsis a few letters in (tests/unit/office-chip-placement.test.ts).
 */
export const chipsOneLine = (viewport: string, compact: boolean, max: number): boolean => viewport === "mobile" || compact || max < CHIP_ROW.max;

// Scratch for `layoutChipRow` (grown on demand): the order, the packed offsets and the pool-adjacent-violators blocks.
let order = new Int32Array(8);
let packed = new Float64Array(8);
let blockSum = new Float64Array(8);
let blockLen = new Int32Array(8);

/**
 * Lays out one row of `n` chips (`targets[i]` the screen x chip i wants, its Rover's head; `half[i]` its half width) inside
 * `bounds`, `CHIP_ROW.gap` apart: writes each centre to `out[i]` (allocates nothing past its scratch). The chips keep the
 * order of their targets (the desk order in the office view; ties by index), and where neighbours would overlap they are
 * nudged along x by the least total squared displacement (isotonic regression by pooling adjacent violators: a crowded
 * run centres on its targets' mean), then the row is shifted inside the bounds as a whole. Returns false when the chips
 * cannot fit side by side: then they are packed from the left bound (the caller hides those past the right one).
 */
export function layoutChipRow(targets: ArrayLike<number>, half: ArrayLike<number>, out: number[], n: number, bounds: ChipRowBounds): boolean {
  if (order.length < n) {
    order = new Int32Array(n);
    packed = new Float64Array(n);
    blockSum = new Float64Array(n);
    blockLen = new Int32Array(n);
  }
  for (let i = 0; i < n; i++) {
    let j = i;
    while (j > 0 && targets[order[j - 1]] > targets[i]) {
      order[j] = order[j - 1];
      j--;
    }
    order[j] = i;
  }
  // packed[k]: the centre of the k-th chip with the row packed from 0; u = x - packed must not decrease along the row.
  let blocks = 0;
  for (let k = 0; k < n; k++) {
    const i = order[k];
    packed[k] = k === 0 ? half[i] : packed[k - 1] + half[order[k - 1]] + CHIP_ROW.gap + half[i];
    blockSum[blocks] = targets[i] - packed[k];
    blockLen[blocks] = 1;
    blocks++;
    while (blocks > 1 && blockSum[blocks - 2] / blockLen[blocks - 2] > blockSum[blocks - 1] / blockLen[blocks - 1]) {
      blockSum[blocks - 2] += blockSum[blocks - 1];
      blockLen[blocks - 2] += blockLen[blocks - 1];
      blocks--;
    }
  }
  if (n === 0) return true;
  const lo = bounds.left;
  const hi = bounds.right - packed[n - 1] - half[order[n - 1]];
  const fits = lo <= hi;
  for (let b = 0, k = 0; b < blocks; b++) {
    const u = fits ? Math.min(Math.max(blockSum[b] / blockLen[b], lo), hi) : lo;
    for (let end = k + blockLen[b]; k < end; k++) out[order[k]] = u + packed[k];
  }
  return fits;
}

/**
 * A chip whose anchor (its Rover's head) is farther than this from the camera shows the agent's name only (the mock's
 * `.tag.far`; near, the activity follows it): at the office stop, with the rover anywhere in the stop's zone, the heads
 * sit 34.8 u or more from a desktop camera and 39 u from a portrait one, and one zoom step (two on a portrait screen)
 * brings all five within 29.4 u (26.7 u) (tests/unit/office-chip-placement.test.ts).
 */
export const OFFICE_CHIP_FAR = 33;

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

/** Half-width of the near/far band, so a camera hovering at the threshold does not flip the chip every frame. */
export const OFFICE_CHIP_FAR_BAND = 1;

/**
 * The next far flag for a chip at `dist` from the camera: far above 34, near below 32, unchanged between. One line
 * (`phone`, `chipsOneLine`) always far: a phone's row holds five dots, and the desk's drawer shows the rest.
 */
export function nextChipFar(far: boolean, dist: number, phone = false): boolean {
  return phone || (far ? dist > OFFICE_CHIP_FAR - OFFICE_CHIP_FAR_BAND : dist > OFFICE_CHIP_FAR + OFFICE_CHIP_FAR_BAND);
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
