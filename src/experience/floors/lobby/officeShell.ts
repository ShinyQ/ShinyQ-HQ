import { useEffect, useRef, type RefObject } from "react";
import { LinearFilter, SRGBColorSpace, Texture } from "three";
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
 * A chip farther than this from the camera shows its first line only (the mock's `.tag.far`): at the office stop the
 * chips sit 39.1 u or more from the camera, and one zoom step (two on a portrait screen) brings the middle three within
 * 37.6 u.
 */
export const OFFICE_CHIP_FAR = 39.5;

/**
 * Whether the chips may show for the camera (`OfficeWatch`, with `officeChipsHere`): only while it holds still
 * (`roverRuntime.cameraSettled`, written by `CameraDirector`). Arriving at the stop the camera eases from the plain
 * follow view, which frames the tall wall's top high on the screen with no room for the chip rows under the top bar,
 * into the office view; part way the chips would crowd the top bar and each other (tests/unit/office-chip-placement.test.ts).
 * A hand zoom on a portrait screen eases its look offset out the same way, so its chips wait too.
 */
export const chipsSettled = (): boolean => roverRuntime.cameraSettled;
/** Half-width of the near/far band, so a camera hovering at the threshold does not flip the chip every frame. */
export const OFFICE_CHIP_FAR_BAND = 1;

/**
 * The next far flag for a chip at `dist` from the camera: far above 40.5, near below 38.5, unchanged between. On a phone
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
