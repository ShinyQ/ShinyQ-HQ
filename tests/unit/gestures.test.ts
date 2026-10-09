import { describe, expect, it } from "vitest";
import {
  classifySwipe,
  classifyWheel,
  DRAG_THRESHOLD,
  exceedsDragThreshold,
  isRotateKey,
  keyToIntent,
  pinchFactor,
  rotateAxisFromKeys,
  twistDelta,
} from "@/experience/input/intents";

describe("tap versus drag", () => {
  it("keeps small mouse movements as clicks (6 px)", () => {
    expect(DRAG_THRESHOLD.mouse).toBe(6);
    expect(exceedsDragThreshold(4, 4, "mouse")).toBe(false);
    expect(exceedsDragThreshold(6, 0, "mouse")).toBe(false);
    expect(exceedsDragThreshold(7, 0, "mouse")).toBe(true);
  });

  it("allows a little more finger jitter for taps (8 px)", () => {
    expect(exceedsDragThreshold(7, 0, "touch")).toBe(false);
    expect(exceedsDragThreshold(0, 9, "touch")).toBe(true);
    expect(exceedsDragThreshold(7, 0, "unknown")).toBe(true);
  });

  it("still classifies a quick tap and a fast vertical swipe", () => {
    expect(classifySwipe({ dx: 3, dy: 2, ms: 120 })).toEqual({ kind: "tap" });
    expect(classifySwipe({ dx: 10, dy: -150, ms: 200 })).toEqual({ kind: "elevator", dir: "up" });
    // A slow horizontal drag is a rotation, never an elevator ride.
    expect(classifySwipe({ dx: 160, dy: 12, ms: 900 })).toEqual({ kind: "scrub", dx: 160 });
  });
});

describe("wheel and trackpad", () => {
  it("routes vertical scrolling to the elevator", () => {
    expect(classifyWheel({ dx: 0, dy: 120, ctrl: false })).toBe("elevator");
    expect(classifyWheel({ dx: 3, dy: -40, ctrl: false })).toBe("elevator");
  });

  it("routes horizontal two-finger swipes (deltaX) to rotation", () => {
    expect(classifyWheel({ dx: 40, dy: 5, ctrl: false })).toBe("rotate");
    expect(classifyWheel({ dx: -12, dy: 0, ctrl: false })).toBe("rotate");
  });

  it("treats ctrl+wheel (trackpad pinch) as zoom", () => {
    expect(classifyWheel({ dx: 0, dy: -8, ctrl: true })).toBe("zoom");
    expect(classifyWheel({ dx: 30, dy: 0, ctrl: true })).toBeNull();
    expect(classifyWheel({ dx: 0, dy: 0, ctrl: false })).toBeNull();
  });
});

describe("two-finger gestures", () => {
  const a = { x: 100, y: 100 };
  const b = { x: 200, y: 100 };

  it("measures twist between finger pairs", () => {
    const quarter = twistDelta(a, b, a, { x: 100, y: 200 });
    expect(quarter).toBeCloseTo(Math.PI / 2);
    expect(twistDelta(a, b, a, { x: 100, y: 0 })).toBeCloseTo(-Math.PI / 2);
    expect(twistDelta(a, b, { x: 110, y: 120 }, { x: 210, y: 120 })).toBeCloseTo(0);
  });

  it("wraps twist across the +-PI seam", () => {
    const left = { x: 0, y: 0 };
    expect(twistDelta(left, { x: -100, y: -1 }, left, { x: -100, y: 1 })).toBeCloseTo(-0.02, 2);
  });

  it("turns finger spread into zoom", () => {
    expect(pinchFactor(100, 200)).toBeCloseTo(0.5);
    expect(pinchFactor(200, 100)).toBeCloseTo(2);
    expect(pinchFactor(0, 100)).toBe(1);
  });
});

describe("rotation keys", () => {
  it("maps Q and E to an axis, Shift doubles it", () => {
    expect(isRotateKey("Q")).toBe(true);
    expect(rotateAxisFromKeys(["q"])).toBe(-1);
    expect(rotateAxisFromKeys(["e"])).toBe(1);
    expect(rotateAxisFromKeys(["e", "shift"])).toBe(2);
    expect(rotateAxisFromKeys(["q", "e"])).toBe(0);
    expect(rotateAxisFromKeys(["w"])).toBe(0);
  });

  it("maps 0 and Home to a view reset", () => {
    expect(keyToIntent("0")).toEqual({ type: "view", action: "reset" });
    expect(keyToIntent("Home")).toEqual({ type: "view", action: "reset" });
    expect(keyToIntent("Home", { inText: true })).toBeNull();
  });
});
