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

/** When each atlas half is due: faces at most FACE_FPS_MAX a second on every tier, desk screens at the tier's rate. */
export class AtlasClock {
  faceDue = false;
  screenDue = false;
  private face = 0;
  private screen = 0;

  tick(now: number, fps: number): void {
    this.faceDue = now >= this.face;
    if (this.faceDue) this.face = now + 1 / FACE_FPS_MAX;
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
