import { useEffect, useRef, type RefObject } from "react";
import { LinearFilter, SRGBColorSpace, Texture } from "three";
import { LOBBY } from "../../config";
import type { SignSpec } from "../../fx/signLayout";
import { cameraClass } from "@/lib/viewport";
import { distanceToRect } from "../../nav/collision";
import { roverRuntime } from "../../rover/runtime";
import type { Rect, Vec2 } from "../../types";
import type { Box } from "../roof/solids";
import { isOfficeRoom, OFFICE, officeObstacles, officeSlots, officeZone, type OfficeSlot } from "./officeLayout";

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

/**
 * The HTML chips hang up from fixed anchors on the screen wall's front face, `gap` (u) over its frame, desks 2 and 4 a
 * `step` higher (two rows, so neighbours never share one and the row stays low), each at its Rover's x pushed `spread`
 * times as far from the wall's centre line (the outer chips still over the wall): the wall stands 4.5 u behind the
 * Rovers, so at their own x the chips of desks 1, 3 and 5 would crowd one row on a portrait tablet. From the office
 * stop, on every camera class, they sit in the empty space over the wall and never cover its text, a desk screen or the
 * visitor's rover, and zoomed in until the middle three show their task lines (desktops and tablets; a phone keeps them
 * compact, `OfficeWatch`) they still clear the wall, each other and the HUD (tests/unit/office-chip-placement.test.ts).
 */
export const CHIP_ROW = { gap: 0.2, step: 2.2, spread: 1.1 } as const;

/** The chips' world anchors (`CHIP_ROW`), one per slot. */
export const OFFICE_CHIP_ANCHORS = OFFICE_SLOTS.map((s) => ({
  x: LOBBY.officeWing.wall.x + (s.rover.x - LOBBY.officeWing.wall.x) * CHIP_ROW.spread,
  y: OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame + CHIP_ROW.gap + CHIP_ROW.step * (s.slot % 2),
  z: LOBBY.officeWing.wall.z - OFFICE.wall.t / 2,
}));

/** A chip's top never goes above this (px): under the HUD's top bar (62 px desktop, 58 px phones), so `OfficeWatch` clamps there. */
export const OFFICE_CHIP_TOP = { desktop: 66, mobile: 64 } as const;

/**
 * Whether the chips keep one line at any distance (`OfficeWatch`): on a phone (`viewport` "mobile"), outside the office
 * view (`compact`), and on the tablet camera (a landscape screen under 1024 px wide, `cameraClass`), where near chips with
 * their task lines would cover each other (tests/unit/office-chip-placement.test.ts).
 */
export const chipsOneLine = (viewport: string, width: number, height: number, compact: boolean): boolean =>
  viewport === "mobile" || compact || cameraClass(width, height) === "tablet";

/**
 * The HUD box in a top corner a chip drops below (px): the desktop profile card (top left, 296 px wide, 153 px down), the
 * Corners HUD's minimap (top right: phones 72 px at top 64, 12 px in; tablets 112 px at top 76, 16 px in). `x` is its
 * inner edge from the screen's left (positive) or right (negative) edge.
 */
const CHIP_CORNER = { desktop: { x: 296, bottom: 153 }, phone: { x: -84, bottom: 136 }, tablet: { x: -128, bottom: 188 } } as const;

/** Each chip's size (`half` its half width, `h` its height, px) and where it shows this frame (`x`, `y`: its bottom centre; x NaN while hidden). */
export interface ChipSpots {
  x: number[];
  y: number[];
  half: number[];
  h: number[];
}

export const chipSpots = (): ChipSpots => ({ x: OFFICE_SLOTS.map(() => NaN), y: OFFICE_SLOTS.map(() => 0), half: OFFICE_SLOTS.map(() => 0), h: OFFICE_SLOTS.map(() => 0) });

/**
 * Where `OfficeWatch` puts chip `slot` (its size in `spots`) whose anchor projects to (`px`, `py`) on a `width` by
 * `height` screen, chips placed in slot order: centred on it and hanging up from it, x clamped 8 px inside the screen
 * edges, its top under the HUD's top bar (`OFFICE_CHIP_TOP`) and under the HUD's top corner box (`hud`, the `hudLayout`)
 * when it would reach under it (a rover at the stop zone's east edge on a phone). Writes `spots.x` and `spots.y`
 * (allocates nothing) and returns false (x NaN) where the chip hides: on the HUD (the bottom band, 84 px; the desktop
 * elevator panel, 219 by 284 px, 16 px in from the right, centred; the Corners joystick, 160 by 144 px, bottom left), and
 * for the dots outside the office view (`pinned`, where the anchors can rise anywhere and the wall can be seen edge on)
 * where it would leave its anchor for the top bar or cover a lower slot's dot.
 */
export function placeChip(spots: ChipSpots, slot: number, px: number, py: number, width: number, height: number, hud: "desktop" | "tablet" | "phone", pinned = false): boolean {
  const { half, h } = spots;
  const corner = CHIP_CORNER[hud];
  const top = OFFICE_CHIP_TOP[hud === "phone" ? "mobile" : "desktop"] + h[slot];
  const x = Math.min(Math.max(px, half[slot] + 8), width - half[slot] - 8);
  let y = Math.max(py, top);
  if (corner.x > 0 ? x - half[slot] < corner.x : x + half[slot] > width + corner.x) y = Math.max(y, corner.bottom + h[slot]);
  let on =
    y <= height - 84 &&
    (hud === "desktop" ? x + half[slot] <= width - 235 || y <= (height - 284) / 2 || y - h[slot] >= (height + 284) / 2 : x - half[slot] >= 160 || y <= height - 144);
  if (pinned) {
    on &&= py >= top;
    for (let j = 0; on && j < slot; j++) on = !(Math.abs(spots.x[j] - x) < half[j] + half[slot] && Math.abs(spots.y[j] - y) < Math.max(h[j], h[slot]));
  }
  spots.x[slot] = on ? x : NaN;
  spots.y[slot] = y;
  return on;
}

/**
 * A chip farther than this from the camera shows its first line only (the mock's `.tag.far`): at the office stop the
 * chips sit 39.6 u or more from a desktop camera (past the band's far edge, so a chip that starts near turns far), and
 * one zoom step (two on a portrait screen) brings the middle three within 36.5 u.
 */
export const OFFICE_CHIP_FAR = 38;

/**
 * How the chips show (`OfficeWatch`) where `officeChipsHere` lets them: "full" (one line far, task lines near) once the
 * camera holds the office view (`roverRuntime.cameraView` is the stop's zone and `cameraHeld`); null (hidden) while that
 * view is applied but the camera has not come to rest in it yet (arriving from the plain follow view, which frames the tall
 * wall's top high on the screen with no room for the chip rows under the top bar, or a device rotation); "compact" (state
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
 * The next far flag for a chip at `dist` from the camera: far above 39, near below 37, unchanged between. On a phone
 * (`phone`) always far: there is no room for task lines over the wall, and the desk's drawer shows them.
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
