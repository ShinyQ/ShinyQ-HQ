import { applyDeadZone } from "./intents";
import type { setJoystick as SetJoystick, StickHandler } from "./joystick";

/**
 * The phone's floating stick (spec 2026-10-29, owner decisions 3.2 to 3.5): a touch that starts in the lower-left drive
 * zone drives once it leaves the tap slop, with the stick centered where the thumb came down; a still tap is left to
 * point-and-go (its drag filter already ignores moved presses); a second press within `doubleTapMs` of a still tap's
 * release toggles Boost unless that tap selected a target (point-and-go's tap-tap drives there). Pure and DOM-free: it
 * rides in the touch controls chunk, which creates one (`createStick`) and registers it in `stickInput` for the world input
 * (`useInputSources`) to feed pointer events; the HUD (`FloatingStick`) draws its `view` and sets the policy (`enabled`,
 * `toggleBoost`). Gestures are timed with the input events' own times, as the fixed stick's are.
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

export interface FloatingStick extends StickHandler {
  /** Set by the HUD: phone layout, coarse pointer, not stepped aside for a docked Rover line. */
  enabled: boolean;
  /** The HUD's Boost toggle (the same state as the Boost button). */
  toggleBoost: (() => void) | null;
  /** Replaced (never mutated) on every change. */
  view: StickView;
  subscribe(listener: () => void): () => void;
  /** Lets go of a held stick at once (the HUD stepping aside, a disable, unmount): the rover stops. */
  release(): void;
}

type Press = { id: number; x: number; y: number; at: number; active: boolean; moved: boolean };

/** A floating stick that drives through `setJoystick` (`input/joystick.ts`, passed in so the chunk imports no main-path value). */
export function createStick(setJoystick: typeof SetJoystick): FloatingStick {
  const listeners = new Set<() => void>();
  let press: Press | null = null;
  /** Release time of the last still tap (0: none pending). */
  let lastTap = 0;
  const show = (view: StickView) => {
    stick.view = view;
    for (const l of [...listeners]) l();
  };
  const rest = () => show({ origin: null, knob: { x: 0, y: 0 } });
  const drive = (p: Press, x: number, y: number) => {
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
  };
  const stick: FloatingStick = {
    enabled: false,
    toggleBoost: null,
    view: { origin: null, knob: { x: 0, y: 0 } },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // A touch at client (x, y) over the world element's `rect`; `canBoost`: no target is tap-selected.
    down(id, x, y, at, rect, canBoost) {
      if (!stick.enabled || press || !inDriveZone(x - rect.left, y - rect.top, rect.width, rect.height)) return false;
      const second = lastTap > 0 && at - lastTap <= STICK.doubleTapMs;
      lastTap = 0;
      if (second && canBoost) stick.toggleBoost?.();
      // The press that completes a pair never starts the next one, so a third tap starts a new pair.
      press = { id, x, y, at, active: false, moved: second };
      return true;
    },
    move(id, x, y) {
      const p = press;
      if (!p || p.id !== id) return false;
      if (!p.active && Math.hypot(x - p.x, y - p.y) >= STICK.slop) p.active = p.moved = true;
      if (p.active) drive(p, x, y);
      return true;
    },
    // `up` is a real release (a cancelled pointer never counts as a tap).
    up(id, at, up) {
      const p = press;
      if (!p || p.id !== id) return false;
      press = null;
      lastTap = up && !p.moved && at - p.at <= STICK.tapMs ? at : 0;
      if (p.active) {
        setJoystick(0, 0, false);
        rest();
      }
      return true;
    },
    release() {
      const held = press?.active;
      press = null;
      lastTap = 0;
      if (held) setJoystick(0, 0, false);
      if (stick.view.origin) rest();
    },
  };
  return stick;
}
