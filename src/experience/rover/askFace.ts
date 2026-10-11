import type { RoverFace } from "../types";

/**
 * Face override from the Ask dock over the 3D tower (src/hud/ask/useAskThread.ts): `thinking` while a question
 * is answered, then `arrived` (^_^) or `blocked` (o_o) for a moment. Plain module state, so the HUD
 * can set it without importing the store or three.js; the Director reads it every frame.
 */
let current: RoverFace | null = null;
let until = 0;

const now = () => (typeof performance === "undefined" ? Date.now() : performance.now());

/** Shows `face` for `holdMs` (default: until cleared). `null` clears it. */
export function setAskFace(face: RoverFace | null, holdMs = Number.POSITIVE_INFINITY) {
  current = face;
  until = face ? now() + holdMs : 0;
}

export function askFace(): RoverFace | null {
  if (current && now() >= until) current = null;
  return current;
}
