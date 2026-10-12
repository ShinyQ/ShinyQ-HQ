import { LOBBY } from "../../config";
import type { Vec2 } from "../../types";

/**
 * Ask Rover kiosk (owner review, October 2026: "the line is not straight"). Body, stand and screen are
 * one unit turned by one yaw, square to the floor grid and facing east, where the default follow camera
 * sits; the screen is centered on the body and every text line sits on one baseline. Pure.
 */
export const KIOSK = {
  /** Square to the grid, facing +x. */
  yaw: Math.PI / 2,
  body: { h: 1.2 },
  stand: { w: 0.4, d: 0.4, h: 0.35 },
  /** Leans back by `tilt` (radians) around its local x; `pad` is the text inset. */
  screen: { h: 1.9, tilt: 0.3, pad: 0.15, lineHeight: 1.45 },
  /** JetBrains Mono advances 0.6 em per glyph. */
  font: { max: 0.12, min: 0.09, advance: 0.6 },
  /** Mission lines on screen at once (it scrolls one line every 2.2 s). */
  visible: 5,
  /** The rover stops this far in front of the screen (point-and-go `L1:kiosk:ask-rover`). */
  stopGap: 2.5,
} as const;

type V3 = [number, number, number];
type Footprint = { x: number; z: number; w: number; d: number };

export interface KioskParts {
  /** The whole kiosk: one group at the footprint center, turned by `KIOSK.yaw`. Everything below is group-local. */
  group: { position: V3; yaw: number };
  /** Local size [across, height, depth]; across is the screen width. */
  body: { size: V3; position: V3 };
  stand: { size: V3; position: V3 };
  /** Centered on the body and the stand; tilted back by `tilt`; no yaw of its own. */
  screen: { position: V3; w: number; h: number; tilt: number; yaw: 0 };
}

const snap = (v: number) => Math.round(v * 1e9) / 1e9 + 0;

/** Unit direction the screen faces (floor plane). */
export function kioskFacing(): Vec2 {
  return { x: snap(Math.sin(KIOSK.yaw)), z: snap(Math.cos(KIOSK.yaw)) };
}

/** Body, stand and screen in the kiosk group's local space, from the world footprint `LOBBY.kiosk`. */
export function kioskParts(k: Footprint = LOBBY.kiosk): KioskParts {
  const f = kioskFacing();
  const depth = Math.abs(f.x) * k.w + Math.abs(f.z) * k.d;
  const across = Math.abs(f.x) * k.d + Math.abs(f.z) * k.w;
  const standTop = KIOSK.body.h + KIOSK.stand.h;
  const halfDrop = (KIOSK.screen.h / 2) * Math.cos(KIOSK.screen.tilt);
  return {
    group: { position: [k.x, 0, k.z], yaw: KIOSK.yaw },
    body: { size: [across, KIOSK.body.h, depth], position: [0, KIOSK.body.h / 2, 0] },
    stand: { size: [KIOSK.stand.w, KIOSK.stand.h, KIOSK.stand.d], position: [0, KIOSK.body.h + KIOSK.stand.h / 2, 0] },
    screen: { position: [0, standTop + halfDrop, 0], w: across, h: KIOSK.screen.h, tilt: KIOSK.screen.tilt, yaw: 0 },
  };
}

/** Where the rover stops for the kiosk: centered in front of the screen. */
export function kioskStop(k: Footprint = LOBBY.kiosk): Vec2 {
  const f = kioskFacing();
  const half = (Math.abs(f.x) * k.w + Math.abs(f.z) * k.d) / 2;
  return { x: snap(k.x + f.x * (half + KIOSK.stopGap)), z: snap(k.z + f.z * (half + KIOSK.stopGap)) };
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

/** The lines on screen at a scroll offset: title, `KIOSK.visible` numbered missions, a gap, the hint; each fitted to one line. */
export function kioskLines(labels: readonly string[], title: string, hint: string, offset: number, width: number): string[] {
  const max = kioskMaxChars(width);
  const shown = Array.from({ length: Math.min(KIOSK.visible, labels.length) }, (_, i) => (offset + i) % labels.length);
  return [title, ...shown.map((i) => `${i + 1}. ${labels[i]}`), "", `> ${hint}`].map((line) => fitLine(line, max));
}

/** One font size for every line: the longest line fills the usable width, within the min and max sizes. */
export function kioskFontSize(lines: readonly string[], width: number): number {
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const fit = (width - 2 * KIOSK.screen.pad) / (longest * KIOSK.font.advance);
  return Math.max(KIOSK.font.min, Math.min(KIOSK.font.max, fit));
}
