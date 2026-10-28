import { applyDeadZone } from "./intents";
import { setJoystick } from "./joystick";

/**
 * The phone's floating stick (spec 2026-10-29, owner decisions 3.2 to 3.5): a touch that starts in the lower-left drive
 * zone drives once it leaves the tap slop, with the stick centered where the thumb came down; a still tap is left to
 * point-and-go (its drag filter already ignores moved presses); a second press within `doubleTapMs` of a still tap's
 * release toggles Boost unless that tap selected a target (point-and-go's tap-tap drives there). Pure and DOM-free: the
 * world input (`useInputSources`) feeds it pointer events, the HUD (`FloatingStick`) draws `floatingStick.view` and sets
 * the policy (`enabled`, `toggleBoost`). Gestures are timed with the input events' own times, as the fixed stick's are.
 */
export const STICK = {
  /** Knob travel (px) for a full push, as the fixed stick (`Joystick.tsx`). */
  radius: 60,
  /** A press moving less than this (px) is still a tap. */
  slop: 12,
  /** A tap releases within this many ms. */
  tapMs: 250,
  /** A press within this many ms of a tap's release completes a double tap. */
  doubleTapMs: 300,
} as const;

/** Floor chip row's bottom on a landscape phone (its 12 to 16 px top inset plus its 46 px height, rounded up). */
const LANDSCAPE_TOP = 72;

/**
 * The drive zone in CSS px of the world element: portrait, the left half of the bottom 40%; landscape (wider than tall),
 * the left 40% of the width below the floor chip row. HUD controls sit above the world, so a zone never steals a button.
 */
export function driveZone(w: number, h: number): { left: number; top: number; right: number; bottom: number } {
  return w > h ? { left: 0, top: LANDSCAPE_TOP, right: 0.4 * w, bottom: h } : { left: 0, top: 0.6 * h, right: w / 2, bottom: h };
}

export function inDriveZone(x: number, y: number, w: number, h: number): boolean {
  const z = driveZone(w, h);
  return x >= z.left && x <= z.right && y >= z.top && y <= z.bottom;
}

export type StickView = {
  /** Where the stick is centered (client px, where the thumb came down), or null while nobody drives. */
  origin: { x: number; y: number } | null;
  /** Knob offset from the origin (px, at most `STICK.radius`). */
  knob: { x: number; y: number };
};

type Press = { id: number; x: number; y: number; at: number; active: boolean; moved: boolean };

const listeners = new Set<() => void>();
let press: Press | null = null;
/** Release time of the last still tap (0: none pending). */
let lastTap = 0;

/** Shared state between the world input and the HUD; `view` is replaced (never mutated) on every change. */
export const floatingStick = {
  /** Set by the HUD: phone layout, coarse pointer, not stepped aside for a docked Rover line. */
  enabled: false,
  /** The HUD's Boost toggle (the same state as the Boost button). */
  toggleBoost: null as (() => void) | null,
  view: { origin: null, knob: { x: 0, y: 0 } } as StickView,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

function show(view: StickView) {
  floatingStick.view = view;
  for (const l of [...listeners]) l();
}

function drive(p: Press, x: number, y: number) {
  let dx = (x - p.x) / STICK.radius;
  let dy = (y - p.y) / STICK.radius;
  const mag = Math.hypot(dx, dy);
  if (mag > 1) {
    dx /= mag;
    dy /= mag;
  }
  const v = applyDeadZone(dx, dy);
  setJoystick(v.x, -v.y, true);
  show({ origin: { x: p.x, y: p.y }, knob: { x: dx * STICK.radius, y: dy * STICK.radius } });
}

/**
 * A touch pointer came down at client (x, y) over the world element's `rect`. Returns true when the stick takes it (the
 * caller then keeps it out of look, pinch and twist). `canBoost`: no target is tap-selected, so a double tap may toggle Boost.
 */
export function stickDown(id: number, x: number, y: number, at: number, rect: { left: number; top: number; width: number; height: number }, canBoost: boolean): boolean {
  if (!floatingStick.enabled || press || !inDriveZone(x - rect.left, y - rect.top, rect.width, rect.height)) return false;
  const second = lastTap > 0 && at - lastTap <= STICK.doubleTapMs;
  lastTap = 0;
  if (second && canBoost) floatingStick.toggleBoost?.();
  // The press that completes a pair never starts the next one, so a third tap starts a new pair.
  press = { id, x, y, at, active: false, moved: second };
  return true;
}

/** Returns true when the pointer is the stick's. */
export function stickMove(id: number, x: number, y: number): boolean {
  const p = press;
  if (!p || p.id !== id) return false;
  if (!p.active && Math.hypot(x - p.x, y - p.y) >= STICK.slop) {
    p.active = true;
    p.moved = true;
  }
  if (p.active) drive(p, x, y);
  return true;
}

/** `up` is a real release (a cancelled pointer never counts as a tap). Returns true when the pointer was the stick's. */
export function stickUp(id: number, at: number, up: boolean): boolean {
  const p = press;
  if (!p || p.id !== id) return false;
  press = null;
  lastTap = up && !p.moved && at - p.at <= STICK.tapMs ? at : 0;
  if (p.active) {
    setJoystick(0, 0, false);
    show({ origin: null, knob: { x: 0, y: 0 } });
  }
  return true;
}

/** Lets go of a held stick at once (the HUD stepping aside, a disable, unmount): the rover stops. */
export function releaseStick(): void {
  const held = press?.active;
  press = null;
  lastTap = 0;
  if (held) setJoystick(0, 0, false);
  if (floatingStick.view.origin) show({ origin: null, knob: { x: 0, y: 0 } });
}
