import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { driveZone, floatingStick, inDriveZone, releaseStick, STICK, stickDown, stickMove, stickUp } from "@/experience/input/floatingStick";
import { joystick } from "@/experience/input/joystick";

/** The phone's floating stick (spec 2026-10-29): the drive zone, drive vs tap, the double tap Boost and letting go. */
const PORTRAIT = { left: 0, top: 0, width: 390, height: 844 };
const LANDSCAPE = { left: 0, top: 0, width: 844, height: 390 };

describe("the drive zone", () => {
  it("is the left half of the bottom 40% in portrait", () => {
    expect(driveZone(390, 844)).toEqual({ left: 0, top: 0.6 * 844, right: 195, bottom: 844 });
    expect(inDriveZone(100, 700, 390, 844)).toBe(true);
    expect(inDriveZone(100, 400, 390, 844)).toBe(false);
    expect(inDriveZone(300, 700, 390, 844)).toBe(false);
  });

  it("is the left 40% below the floor chip row in landscape", () => {
    expect(driveZone(844, 390)).toEqual({ left: 0, top: 72, right: 0.4 * 844, bottom: 390 });
    expect(inDriveZone(100, 200, 844, 390)).toBe(true);
    expect(inDriveZone(100, 40, 844, 390)).toBe(false);
    expect(inDriveZone(500, 200, 844, 390)).toBe(false);
  });
});

describe("the floating stick gesture", () => {
  const toggle = vi.fn();
  let seen = 0;
  let off: () => void;
  beforeEach(() => {
    floatingStick.enabled = true;
    floatingStick.toggleBoost = toggle;
    toggle.mockClear();
    seen = 0;
    off = floatingStick.subscribe(() => seen++);
  });
  afterEach(() => {
    releaseStick();
    off();
    floatingStick.enabled = false;
    floatingStick.toggleBoost = null;
  });

  it("takes only touches in the zone, and only while enabled", () => {
    expect(stickDown(1, 300, 700, 0, PORTRAIT, true)).toBe(false);
    floatingStick.enabled = false;
    expect(stickDown(1, 100, 700, 0, PORTRAIT, true)).toBe(false);
    floatingStick.enabled = true;
    expect(stickDown(1, 100, 700, 0, PORTRAIT, true)).toBe(true);
    // One stick at a time: a second finger in the zone is left to look.
    expect(stickDown(2, 120, 720, 10, PORTRAIT, true)).toBe(false);
    expect(stickMove(2, 150, 720)).toBe(false);
    expect(stickUp(2, 20, true)).toBe(false);
  });

  it("counts the world element's offset for the zone", () => {
    expect(stickDown(1, 100 + 500, 700, 0, { ...PORTRAIT, left: 500 }, true)).toBe(true);
  });

  it("drives once it leaves the tap slop, centered where the thumb came down", () => {
    stickDown(1, 100, 300, 0, LANDSCAPE, true);
    stickMove(1, 100 + STICK.slop - 1, 300);
    expect(joystick.active).toBe(false);
    expect(floatingStick.view.origin).toBeNull();
    stickMove(1, 100 + STICK.radius, 300);
    expect(joystick.active).toBe(true);
    expect(joystick.x).toBeCloseTo(1, 9);
    expect(joystick.y).toBeCloseTo(0, 9);
    expect(floatingStick.view.origin).toEqual({ x: 100, y: 300 });
    expect(floatingStick.view.knob).toEqual({ x: STICK.radius, y: 0 });
    // Up the screen drives forward; past the radius the knob stops at the rim.
    stickMove(1, 100, 300 - 3 * STICK.radius);
    expect(joystick.y).toBeCloseTo(1, 9);
    expect(floatingStick.view.knob.y).toBeCloseTo(-STICK.radius, 9);
    expect(seen).toBeGreaterThan(0);
    expect(stickUp(1, 500, true)).toBe(true);
    expect(joystick.active).toBe(false);
    expect([joystick.x, joystick.y]).toEqual([0, 0]);
    expect(floatingStick.view.origin).toBeNull();
  });

  it("leaves a still tap alone (point-and-go selects it), and a double tap on empty floor toggles Boost", () => {
    stickDown(1, 100, 300, 0, LANDSCAPE, true);
    stickUp(1, 100, true);
    expect(joystick.active).toBe(false);
    expect(seen).toBe(0);
    stickDown(1, 104, 302, 100 + STICK.doubleTapMs, LANDSCAPE, true);
    expect(toggle).toHaveBeenCalledTimes(1);
    stickUp(1, 450, true);
    // The press that completed the pair never starts the next one.
    stickDown(1, 100, 300, 500, LANDSCAPE, true);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("never toggles Boost when the first tap selected a target (its second tap drives there), after a slow or moved tap, or a late second press", () => {
    stickDown(1, 100, 300, 0, LANDSCAPE, true);
    stickUp(1, 100, true);
    stickDown(1, 100, 300, 200, LANDSCAPE, false);
    stickUp(1, 250, true);
    expect(toggle).not.toHaveBeenCalled();
    stickDown(1, 100, 300, 1000, LANDSCAPE, true);
    stickUp(1, 1000 + STICK.tapMs + 1, true);
    stickDown(1, 100, 300, 1300, LANDSCAPE, true);
    stickUp(1, 1350, true);
    expect(toggle).not.toHaveBeenCalled();
    stickDown(1, 100, 300, 2000 + STICK.doubleTapMs + 1, LANDSCAPE, true);
    stickUp(1, 2400, false);
    stickDown(1, 100, 300, 2450, LANDSCAPE, true);
    expect(toggle).not.toHaveBeenCalled();
  });

  it("lets go at once when the HUD releases it", () => {
    stickDown(1, 100, 300, 0, LANDSCAPE, true);
    stickMove(1, 160, 300);
    expect(joystick.active).toBe(true);
    releaseStick();
    expect(joystick.active).toBe(false);
    expect(floatingStick.view.origin).toBeNull();
    expect(stickMove(1, 170, 300)).toBe(false);
  });
});
