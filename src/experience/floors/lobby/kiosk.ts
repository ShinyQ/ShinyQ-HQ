import { kioskRect, LOBBY } from "../../config";
import type { Rect, Vec2 } from "../../types";

/**
 * Rover menu kiosk. Body, stand and screen are one unit turned by one yaw (owner review, October 2026:
 * "the line is not straight"; every text line sits on one baseline). Owner review 2026-10-14 ("the rover
 * kiosk not straight line into the circle"): the kiosk stands on the kiosk axis (`LOBBY.kioskAxis`, from
 * the hologram toward the Visitor Observatory) facing the hologram, its lane spoke runs straight along the
 * axis from the ring into its front, and the session spawn is its stop. Pure.
 */
export const KIOSK = {
  /** Faces the hologram along the kiosk axis (config). */
  yaw: LOBBY.kiosk.yaw,
  body: { h: 1.2 },
  stand: { w: 0.4, d: 0.4, h: 0.35 },
  /** Leans back by `tilt` (radians) around its local x; `pad` is the text inset. */
  screen: { h: 1.9, tilt: 0.3, pad: 0.15, lineHeight: 1.45 },
  /** JetBrains Mono advances 0.6 em per glyph. */
  font: { max: 0.12, min: 0.09, advance: 0.6 },
  /** Mission lines on screen at once (it scrolls one line every 2.2 s). */
  visible: 5,
  /** The rover stops this far in front of the screen (point-and-go `L1:kiosk:ask-rover`, the session spawn). */
  stopGap: LOBBY.kiosk.stopGap,
  /** The lane spoke ends this far in front of the kiosk front. */
  laneGap: 0.4,
} as const;

/** Unit direction from the hologram to the observatory: the kiosk, its spoke and the spawn lie on it. */
export const KIOSK_AXIS: Vec2 = LOBBY.kioskAxis;
/** Rover heading at the session spawn: facing the kiosk screen. */
export const SPAWN_HEADING: number = LOBBY.spawnHeading;

type V3 = [number, number, number];
type Footprint = { x: number; z: number; depth: number; width: number };

export interface KioskParts {
  /** The whole kiosk: one group at the footprint center, turned by `KIOSK.yaw`. Everything below is group-local. */
  group: { position: V3; yaw: number };
  /** Local size [across, height, depth]; across is the screen width. */
  body: { size: V3; position: V3 };
  stand: { size: V3; position: V3 };
  /** Centered on the body and the stand; tilted back by `tilt`; no yaw of its own. */
  screen: { position: V3; w: number; h: number; tilt: number; yaw: 0 };
}

/** Unit direction the screen faces (floor plane): toward the hologram. */
export function kioskFacing(): Vec2 {
  return { x: Math.sin(KIOSK.yaw), z: Math.cos(KIOSK.yaw) };
}

/** Body, stand and the screen in the kiosk group's local space, from the footprint `LOBBY.kiosk`. */
export function kioskParts(k: Footprint = LOBBY.kiosk): KioskParts {
  const standTop = KIOSK.body.h + KIOSK.stand.h;
  const halfDrop = (KIOSK.screen.h / 2) * Math.cos(KIOSK.screen.tilt);
  return {
    group: { position: [k.x, 0, k.z], yaw: KIOSK.yaw },
    body: { size: [k.width, KIOSK.body.h, k.depth], position: [0, KIOSK.body.h / 2, 0] },
    stand: { size: [KIOSK.stand.w, KIOSK.stand.h, KIOSK.stand.d], position: [0, KIOSK.body.h + KIOSK.stand.h / 2, 0] },
    screen: { position: [0, standTop + halfDrop, 0], w: k.width, h: KIOSK.screen.h, tilt: KIOSK.screen.tilt, yaw: 0 },
  };
}

/** A point `d` in front of the kiosk center along its facing. */
function ahead(d: number, k: Footprint = LOBBY.kiosk): Vec2 {
  const f = kioskFacing();
  return { x: k.x + f.x * d, z: k.z + f.z * d };
}

/** Where the rover stops for the kiosk: centered in front of the screen (also the session spawn). */
export function kioskStop(k: Footprint = LOBBY.kiosk): Vec2 {
  return ahead(k.depth / 2 + KIOSK.stopGap, k);
}

/** Where the kiosk lane spoke ends: `KIOSK.laneGap` in front of the kiosk front, on the kiosk axis. */
export function kioskLaneEnd(k: Footprint = LOBBY.kiosk): Vec2 {
  return ahead(k.depth / 2 + KIOSK.laneGap, k);
}

/** Axis-aligned bounds of the turned footprint (the obstacle and the point-and-go pick volume). */
export function kioskBounds(): Rect {
  return kioskRect();
}

/** Shortens a line to `max` characters with ASCII dots (the kiosk font always has them). */
export function fitLine(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

/** Most characters one line holds at the smallest font size. */
export function kioskMaxChars(width: number): number {
  return Math.floor((width - 2 * KIOSK.screen.pad) / (KIOSK.font.min * KIOSK.font.advance));
}

/** Every line the screen can ever show (title, each numbered mission, the hint): the font size fits the longest. */
export function kioskAllLines(labels: readonly string[], title: string, hint: string): string[] {
  return [title, ...labels.map((label, i) => `${i + 1}. ${label}`), `> ${hint}`];
}

/**
 * The kiosk text at a scroll offset (below `labels.length`), each line fitted to one line: the title, `KIOSK.visible`
 * numbered missions, a gap and the hint on the screen, then the other missions, which MissionKiosk clips. Every offset
 * holds the same glyphs, so troika updates the text in place: a new glyph count disposes its geometry, and an unseen
 * kiosk never uploaded it again (the renderer's geometry count one lower at random).
 */
export function kioskLines(labels: readonly string[], title: string, hint: string, offset: number, width: number): string[] {
  const max = kioskMaxChars(width);
  const numbered = labels.map((label, i) => `${i + 1}. ${label}`);
  const order = [...numbered.slice(offset), ...numbered.slice(0, offset)];
  return [title, ...order.slice(0, KIOSK.visible), "", `> ${hint}`, ...order.slice(KIOSK.visible)].map((line) => fitLine(line, max));
}

/** One font size for every line: the longest line fills the usable width, within the min and max sizes. */
export function kioskFontSize(lines: readonly string[], width: number): number {
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const fit = (width - 2 * KIOSK.screen.pad) / (longest * KIOSK.font.advance);
  return Math.max(KIOSK.font.min, Math.min(KIOSK.font.max, fit));
}
