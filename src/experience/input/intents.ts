import type { FloorId, RoomId } from "@/content/schema";
import type { Vec2 } from "../types";

/**
 * Every device input maps to an intent (appendix 03 section 3). Floors and the
 * HUD only consume intents, never raw DOM events.
 */
export type Intent =
  | { type: "move"; x: number; y: number }
  | { type: "goto"; point: Vec2 }
  | { type: "elevator"; to: "up" | "down" | FloorId }
  | { type: "scrub"; dx: number }
  | { type: "open"; room: RoomId }
  | { type: "cancel" }
  | { type: "palette" }
  | { type: "terminal" }
  | { type: "toggle"; what: "sound" | "lang" | "readme" }
  | { type: "zoom"; factor: number }
  | { type: "orbit"; dyaw: number; dpitch?: number; smooth?: boolean; source: OrbitSource }
  | { type: "view"; action: "reset" };

/**
 * Where a camera rotation came from. Floors may filter by source (for example, L2 can keep a
 * one-finger `touch` drag for scrubbing through time).
 */
export type OrbitSource = "mouse" | "touch" | "twist" | "wheel" | "keys" | "button";

export type IntentListener = (intent: Intent) => void;

export interface IntentBus {
  emit: (intent: Intent) => void;
  on: (listener: IntentListener) => () => void;
}

export function createIntentBus(): IntentBus {
  const listeners = new Set<IntentListener>();
  return {
    emit: (intent) => listeners.forEach((l) => l(intent)),
    on: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Shared bus for the experience (one canvas per page). */
export const intents = createIntentBus();

const MOVE_KEYS: Record<string, [number, number]> = {
  w: [0, 1],
  arrowup: [0, 1],
  s: [0, -1],
  arrowdown: [0, -1],
  a: [-1, 0],
  arrowleft: [-1, 0],
  d: [1, 0],
  arrowright: [1, 0],
};

export function isMoveKey(key: string): boolean {
  return key.toLowerCase() in MOVE_KEYS;
}

/** Combines held movement keys into a vector (x right, y forward), length at most 1. */
export function moveVectorFromKeys(held: Iterable<string>): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const key of held) {
    const v = MOVE_KEYS[key.toLowerCase()];
    if (v) {
      x += v[0];
      y += v[1];
    }
  }
  x = Math.sign(x);
  y = Math.sign(y);
  const len = Math.hypot(x, y);
  return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
}

export interface KeyContext {
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  /** Focus is in a text field (palette search, inputs). */
  inText?: boolean;
  /** Focus is on a button or link, which owns Enter and Space. */
  inControl?: boolean;
}

/** Maps a discrete key press to an intent. Movement keys are polled separately. */
export function keyToIntent(key: string, ctx: KeyContext = {}): Intent | null {
  if (ctx.inText) return null;
  const k = key.toLowerCase();
  if ((ctx.ctrl || ctx.meta) && k === "k") return { type: "palette" };
  if (ctx.ctrl || ctx.meta || ctx.alt) return null;
  switch (k) {
    case "pageup":
      return { type: "elevator", to: "up" };
    case "pagedown":
      return { type: "elevator", to: "down" };
    case "escape":
      return { type: "cancel" };
    case "/":
      return { type: "palette" };
    case "m":
      return { type: "toggle", what: "sound" };
    case "l":
      return { type: "toggle", what: "lang" };
    case "t":
      return { type: "toggle", what: "readme" };
    case "enter":
      return ctx.inControl ? null : { type: "terminal" };
    case "0":
    case "home":
      return { type: "view", action: "reset" };
    default:
      return null;
  }
}

/**
 * Turns a stream of wheel deltas into at most one elevator step per gesture.
 * A gesture ends after `gapMs` without wheel events, which absorbs trackpad momentum.
 */
export function createWheelGate({ threshold = 40, cooldownMs = 700, gapMs = 220 } = {}) {
  let acc = 0;
  let last = -Infinity;
  let lastFire = -Infinity;
  let firedThisGesture = false;
  return (deltaY: number, now: number): "up" | "down" | null => {
    if (now - last > gapMs) {
      acc = 0;
      firedThisGesture = false;
    }
    last = now;
    if (firedThisGesture) return null;
    acc += deltaY;
    if (Math.abs(acc) < threshold || now - lastFire < cooldownMs) return null;
    const dir = acc < 0 ? "up" : "down";
    acc = 0;
    lastFire = now;
    firedThisGesture = true;
    return dir;
  };
}

export type Swipe = { kind: "tap" } | { kind: "elevator"; dir: "up" | "down" } | { kind: "scrub"; dx: number };

/** Classifies a single-finger gesture (appendix 03: vertical swipe > 60 px in < 400 ms). */
export function classifySwipe({ dx, dy, ms }: { dx: number; dy: number; ms: number }): Swipe | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 10 && ay < 10 && ms <= 350) return { kind: "tap" };
  if (ay > 60 && ms < 400 && ay > ax * 1.2) return { kind: "elevator", dir: dy < 0 ? "up" : "down" };
  if (ax > 30 && ax > ay) return { kind: "scrub", dx };
  return null;
}

/** Radial dead zone, rescaled so output starts at 0 just outside the zone (joystick: 12%). */
export function applyDeadZone(x: number, y: number, deadZone = 0.12): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag <= deadZone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (mag - deadZone) / (1 - deadZone));
  return { x: (x / mag) * scaled, y: (y / mag) * scaled };
}

const ROTATE_KEYS: Record<string, number> = { q: -1, e: 1 };

export function isRotateKey(key: string): boolean {
  return key.toLowerCase() in ROTATE_KEYS;
}

/** Held Q/E as a rotation axis (Q left = -1, E right = +1). Shift doubles the speed. */
export function rotateAxisFromKeys(held: Iterable<string>): number {
  let axis = 0;
  let fast = false;
  for (const key of held) {
    const k = key.toLowerCase();
    axis += ROTATE_KEYS[k] ?? 0;
    if (k === "shift") fast = true;
  }
  return Math.sign(axis) * (fast ? 2 : 1);
}

/** Pixels a pointer must travel before a press becomes a drag (below it, it is a click or tap). */
export const DRAG_THRESHOLD = { mouse: 6, pen: 6, touch: 8 } as const;

export function exceedsDragThreshold(dx: number, dy: number, pointerType: string): boolean {
  const limit = DRAG_THRESHOLD[pointerType as keyof typeof DRAG_THRESHOLD] ?? DRAG_THRESHOLD.mouse;
  return Math.hypot(dx, dy) > limit;
}

export type WheelKind = "zoom" | "rotate" | "elevator" | null;

/**
 * Splits wheel input: pinch on a trackpad arrives as ctrl+wheel (zoom), a horizontal two-finger
 * swipe (or shift+wheel) is deltaX (rotate), and vertical scrolling stays the elevator.
 */
export function classifyWheel({ dx, dy, ctrl }: { dx: number; dy: number; ctrl: boolean }): WheelKind {
  if (ctrl) return dy !== 0 ? "zoom" : null;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax === 0 && ay === 0) return null;
  return ax > ay ? "rotate" : "elevator";
}

type Point = { x: number; y: number };

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Rotation of the line between two touch points, in radians (positive = clockwise on screen). */
export function twistDelta(a0: Point, b0: Point, a1: Point, b1: Point): number {
  const before = Math.atan2(b0.y - a0.y, b0.x - a0.x);
  const after = Math.atan2(b1.y - a1.y, b1.x - a1.x);
  return wrapPi(after - before);
}

/** Zoom factor for a pinch: fingers apart (distance grows) zooms in (factor below 1). */
export function pinchFactor(before: number, after: number): number {
  return before > 0 && after > 0 ? before / after : 1;
}
