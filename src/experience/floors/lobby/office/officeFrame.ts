import type { OfficeState } from "@/lib/office/protocol";
import { FACE_FPS_MAX } from "./officeAtlas";
import { CROSSFADE_S, poseChanged, type OfficePose } from "./officeVisual";
import { wallSpin, type WallModel } from "./officeWall";

/**
 * The office frame loop's skip decisions (pure, no three): which Rovers need their instance matrices, face quad,
 * chip anchor or glow written this frame, when the atlas halves are due, the reduced-motion crossfade in the cell
 * keys, and when the wall rebuilds its model or redraws. OfficeScene keeps the GPU calls thin around these.
 */

/** Camera moves smaller than this (u, in x or z) leave the camera-turned antenna tips as written. */
export const CAMERA_EPS = 1e-3;

/**
 * Per-Rover write flags. `pose` and `glow` record this frame's values and mark what changed; the flags stay set
 * until `done(slot)` (the writes may wait for the next drawn frame, `whenDrawn`, which keeps only the latest work).
 */
export class RoverWrites {
  readonly poses: OfficePose[];
  readonly glowKeys: string[];
  readonly posePending: boolean[];
  readonly glowPending: boolean[];
  /** The camera the tips were last turned to. */
  readonly cam: { x: number; z: number };

  constructor(count: number, rest: OfficePose, restGlowKey: string, camera: { x: number; z: number }) {
    this.poses = Array.from({ length: count }, () => ({ ...rest }));
    this.glowKeys = Array.from({ length: count }, () => restGlowKey);
    this.posePending = Array.from({ length: count }, () => false);
    this.glowPending = Array.from({ length: count }, () => false);
    this.cam = { x: camera.x, z: camera.z };
  }

  /** Records the slot's pose; true when it changed (its matrices, face quad and chip anchor need writing, its glow too). */
  pose(slot: number, p: OfficePose): boolean {
    const a = this.poses[slot];
    if (!poseChanged(a, p)) return false;
    Object.assign(a, p);
    this.posePending[slot] = true;
    this.glowPending[slot] = true;
    return true;
  }

  /** Records the slot's `glowKey`; marks its glow when the key changed. */
  glow(slot: number, key: string): void {
    if (this.glowKeys[slot] === key) return;
    this.glowKeys[slot] = key;
    this.glowPending[slot] = true;
  }

  /** True (and every glow marked) when the camera moved more than CAMERA_EPS in x or z since the tips were last turned. */
  camera(x: number, z: number): boolean {
    if (Math.abs(x - this.cam.x) <= CAMERA_EPS && Math.abs(z - this.cam.z) <= CAMERA_EPS) return false;
    this.cam.x = x;
    this.cam.z = z;
    this.glowPending.fill(true);
    return true;
  }

  pending(): boolean {
    return this.posePending.includes(true) || this.glowPending.includes(true);
  }

  /** Clears the slot's flags once its writes ran. */
  done(slot: number): void {
    this.posePending[slot] = false;
    this.glowPending[slot] = false;
  }
}

/**
 * When each atlas half is due: faces at most FACE_FPS_MAX a second on every tier (or `faceFps` when lower: the far level
 * of detail), desk screens at the tier's rate.
 */
export class AtlasClock {
  faceDue = false;
  screenDue = false;
  private face = 0;
  private screen = 0;

  tick(now: number, fps: number, faceFps: number = FACE_FPS_MAX): void {
    this.faceDue = now >= this.face;
    if (this.faceDue) this.face = now + 1 / Math.min(faceFps, FACE_FPS_MAX);
    this.screenDue = now >= this.screen;
    if (this.screenDue) this.screen = now + 1 / fps;
  }
}

export interface Fade {
  from: OfficeState;
  at: number;
}

/** Steps of the crossfade alpha in the cell keys (each step uploads its cell once). */
export const FADE_STEPS = 8;

/** The slot's crossfade after this frame: a state change starts one under reduced motion (full motion cuts); it ends after CROSSFADE_S. */
export function stepFade(prev: OfficeState, next: OfficeState, fade: Fade | null, reduced: boolean, now: number): Fade | null {
  if (prev !== next) return reduced ? { from: prev, at: now } : null;
  return fade && now < fade.at + CROSSFADE_S ? fade : null;
}

/** Alpha of the new look (1 without a fade). */
export function fadeLevel(fade: Fade | null, now: number): number {
  if (!fade || now >= fade.at + CROSSFADE_S) return 1;
  return Math.max(0, (now - fade.at) / CROSSFADE_S);
}

/** Key suffix of a fading cell: the old state and the quantized alpha, so every step uploads; "" once the fade ended. */
export function fadeTag(fade: Fade | null, k: number): string {
  return fade && k < 1 ? `~${fade.from}:${Math.floor(k * FADE_STEPS)}` : "";
}

/** Rebuild the wall model at least this often (s), for its "x min ago" ages. */
export const WALL_REBUILD_S = 1;

/**
 * The wall's gate: the model rebuilds only when an input (the view, the translator, the locale) changed or a
 * second passed, its content key (the only JSON.stringify) is cached per rebuild, and a redraw happens only when
 * that key or the spinner frame changed.
 */
export class WallGate {
  private deps: readonly unknown[] = [];
  private builtAt = -Infinity;
  private content = "";
  private drawnContent: string | null = null;
  private drawnSpin = 0;

  stale(deps: readonly unknown[], now: number): boolean {
    const same = deps.length === this.deps.length && deps.every((d, i) => d === this.deps[i]);
    if (same && now - this.builtAt < WALL_REBUILD_S) return false;
    this.deps = deps;
    this.builtAt = now;
    return true;
  }

  built(model: WallModel): void {
    this.content = JSON.stringify(model);
  }

  /** True when the wall must redraw (records it as drawn); `t` is fixed under reduced motion. */
  changed(model: WallModel, t: number): boolean {
    const spin = wallSpin(model, t);
    if (this.content === this.drawnContent && spin === this.drawnSpin) return false;
    this.drawnContent = this.content;
    this.drawnSpin = spin;
    return true;
  }

  /** Forces the next check to redraw (fonts became ready). */
  reset(): void {
    this.drawnContent = null;
  }
}

/**
 * A chip's leader line: its opacity, faded where the chip itself sits over the wall's screens, the tick at the wall-top
 * level (px), and how far a tick beside the wall keeps from a HUD box or the screen's edge (px).
 */
export const LEAD = { opacity: 0.6, faded: 0.15, tick: 10, clear: 4 } as const;

/** Where a chip's leader line ends (`leadEnd`) and how it is drawn. */
export interface LeadEnd {
  x: number;
  y: number;
  tick: boolean;
  faded: boolean;
}

/** Where a line meets an edge (`meet`): `t` along the line, `s` along the edge (0 to 1 on it). */
const cut = { t: 0, s: 0 };

/** Where the line from (x, y) along (dx, dy) meets the edge from (ax, ay) to (bx, by), into `cut`; false when parallel or NaN. */
function meet(x: number, y: number, dx: number, dy: number, ax: number, ay: number, bx: number, by: number): boolean {
  const ex = bx - ax;
  const ey = by - ay;
  const den = dx * ey - dy * ex;
  if (!(Math.abs(den) > 1e-9)) return false;
  cut.t = ((ax - x) * ey - (ay - y) * ex) / den;
  cut.s = ((ax - x) * dy - (ay - y) * dx) / den;
  return true;
}

/** A box a tick beside the wall keeps clear of (px; `ScreenBox`'s shape, the HUD boxes). */
interface ClearBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The end of the leader line from (x, y), a chip's bottom centre, toward its Rover's head (hx, hy), with the screen wall's
 * top edge projected through (wx0, wy0) and (wx1, wy1) (px; NaN off the camera). Every line stops at the wall-top level
 * with a tick, so none runs down past it (the chip's colour and its Rover's antenna carry the mapping): where the line
 * crosses the top edge on the wall, at that crossing; where it would pass the edge beside the wall (a chip past the wall's
 * end, toward an end Rover: ten chips span a row wider than the wall), on the edge's line (the wall-top level) above the
 * Rover's head (or, `above` false, where the line itself meets that level: `OfficeWatch`'s fallback where the first would
 * cross another chip), its x moved clear of the `hud` boxes and inside the screen's `width` (`LEAD.clear` px off them).
 * Either needs the level at least `min` px under the chip; where it is not (the chip itself sits over the screens or
 * under the level) the line runs to the head faded (`LEAD.faded`). The whole line, unfaded, when the head stands above
 * the level or the wall is off the camera. Writes `out`, allocates nothing.
 */
export function leadEnd(x: number, y: number, hx: number, hy: number, wx0: number, wy0: number, wx1: number, wy1: number, min: number, out: LeadEnd, hud: readonly ClearBox[] = [], width = Infinity, above = true): LeadEnd {
  out.x = hx;
  out.y = hy;
  out.tick = out.faded = false;
  const dx = hx - x;
  const dy = hy - y;
  // Parallel, the wall off the camera (NaN) or the head above the level: the whole line.
  if (!meet(x, y, dx, dy, wx0, wy0, wx1, wy1) || cut.t >= 1) return out;
  if (cut.s >= 0 && cut.s <= 1) {
    if (cut.t * Math.hypot(dx, dy) >= min) {
      out.x = x + cut.t * dx;
      out.y = y + cut.t * dy;
      out.tick = true;
    } else out.faded = true;
    return out;
  }
  // Beside the wall: the wall-top level (the top edge's line) above the head, the tick clear of the HUD boxes.
  const slope = (wy1 - wy0) / (wx1 - wx0);
  const half = LEAD.tick / 2 + LEAD.clear;
  let ex = above ? hx : x + cut.t * dx;
  let ey = wy0 + slope * (ex - wx0);
  for (let pass = 0; pass <= hud.length; pass++) {
    let moved = false;
    for (let i = 0; i < hud.length; i++) {
      const b = hud[i];
      if (ey < b.y0 - half || ey > b.y1 + half || ex + half <= b.x0 || ex - half >= b.x1) continue;
      ex = (b.x0 + b.x1) / 2 < width / 2 ? b.x1 + half : b.x0 - half;
      ey = wy0 + slope * (ex - wx0);
      moved = true;
    }
    if (!moved) break;
  }
  ex = Math.min(Math.max(ex, half), width - half);
  ey = wy0 + slope * (ex - wx0);
  if (Number.isFinite(ey) && ey - y >= min) {
    out.x = ex;
    out.y = ey;
    out.tick = true;
  } else out.faded = true;
  return out;
}
