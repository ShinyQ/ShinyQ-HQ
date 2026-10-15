import type { Vec2 } from "../types";
import { yawTowards } from "./facing";
import { monoWidth } from "./readableFlip";

/**
 * Floating signs (spectacle round, owner request 2026-10-13: "i dont like wording on floor make it just
 * like the AI Engineering & Product Engineering floating for all wording which on the floor"). Every
 * word that used to lie on a floor floats upright on a dark plate with a neon rim and turns to the
 * camera (yaw only), so it reads left to right from any camera yaw and never shows its mirrored back.
 * Pure (Vitest runs it in node); `FloatingSigns` renders a list of them in two draw calls.
 */
export interface SignSpec {
  text: string;
  /** Anchor: the middle of the plate (floor-relative). */
  x: number;
  y: number;
  z: number;
  /** Text and rim color. */
  color: string;
  fontSize: number;
  /** Monospace font url (the plate width assumes monospace advances). */
  font?: string;
  letterSpacing?: number;
  /** Lean back (radians) toward a high camera, like the L2 room labels. */
  tilt?: number;
  /** Road x for the L2 distance fade (`labelFade`); omitted means always shown. */
  fadeX?: number;
  /** Fill opacity of the text (1 by default). */
  opacity?: number;
  /** Rides the group's orbit (`FloatingSigns` `orbit`): x and z turn about the group origin by the orbit angle (the L4 topic labels). */
  orbit?: boolean;
}

/** `x`, `z` turned about the origin by `angle` (three's yaw: positive turns counterclockwise seen from above). */
export function orbitXZ(x: number, z: number, angle: number): { x: number; z: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c + z * s, z: -x * s + z * c };
}

/** Plate padding around the text block, in font sizes. */
export const SIGN_PAD = { x: 0.8, y: 0.45 } as const;

/** Plate size (u) behind a sign: the monospace text block plus padding. */
export function signPlate(spec: Pick<SignSpec, "text" | "fontSize" | "letterSpacing">): { w: number; h: number } {
  const lines = spec.text.split("\n");
  const width = Math.max(...lines.map((l) => monoWidth(l, spec.fontSize, spec.letterSpacing ?? 0)));
  return { w: width + spec.fontSize * SIGN_PAD.x * 2, h: lines.length * spec.fontSize * 1.15 + spec.fontSize * SIGN_PAD.y * 2 };
}

/** Yaw that turns a sign at `at` square to a camera at `camera` (front faces +z at yaw 0). */
export function signFacing(at: Vec2, camera: Vec2): number {
  return yawTowards(at, camera);
}

/** How square a sign facing `yaw` is to the camera: 1 faces it, 0 edge on, below 0 shows its back. */
export function signFacingDot(yaw: number, at: Vec2, camera: Vec2): number {
  const dx = camera.x - at.x;
  const dz = camera.z - at.z;
  const len = Math.hypot(dx, dz) || 1;
  return (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / len;
}

/** Breaks `text` into lines of at most `max` characters at spaces (a longer word keeps its own line). */
export function wrapSign(text: string, max: number): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

/** Opacity at or below which a floating sign counts as hidden (it draws nothing). */
export const SIGN_HIDDEN = 0.01;

/**
 * Consecutive hidden frames of a sign: one more while its opacity `k` stays at or below `SIGN_HIDDEN`,
 * back to 0 as soon as it rises. `FloatingSigns dropHidden` drops a sign's glyphs once this reaches its limit.
 */
export function nextHiddenFrames(prev: number, k: number): number {
  return k <= SIGN_HIDDEN ? prev + 1 : 0;
}
