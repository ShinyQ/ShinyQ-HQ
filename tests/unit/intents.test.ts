import { describe, expect, it, vi } from "vitest";
import {
  applyDeadZone,
  classifySwipe,
  createIntentBus,
  createWheelGate,
  isMoveKey,
  keyToIntent,
  moveVectorFromKeys,
} from "@/experience/input/intents";

describe("intent bus", () => {
  it("delivers intents to listeners until they unsubscribe", () => {
    const bus = createIntentBus();
    const listener = vi.fn();
    const off = bus.on(listener);
    bus.emit({ type: "cancel" });
    off();
    bus.emit({ type: "cancel" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("keyboard mapping", () => {
  it("builds normalized move vectors from WASD and arrows", () => {
    expect(moveVectorFromKeys(["w"])).toEqual({ x: 0, y: 1 });
    expect(moveVectorFromKeys(["ArrowLeft"])).toEqual({ x: -1, y: 0 });
    const diag = moveVectorFromKeys(["w", "d"]);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1);
    expect(moveVectorFromKeys(["w", "s"])).toEqual({ x: 0, y: 0 });
    expect(moveVectorFromKeys(["w", "ArrowUp"])).toEqual({ x: 0, y: 1 });
    expect(isMoveKey("D")).toBe(true);
    expect(isMoveKey("q")).toBe(false);
  });

  it("maps discrete keys to intents", () => {
    expect(keyToIntent("PageUp")).toEqual({ type: "elevator", to: "up" });
    expect(keyToIntent("PageDown")).toEqual({ type: "elevator", to: "down" });
    expect(keyToIntent("Escape")).toEqual({ type: "cancel" });
    expect(keyToIntent("m")).toEqual({ type: "toggle", what: "sound" });
    expect(keyToIntent("l")).toEqual({ type: "toggle", what: "lang" });
    expect(keyToIntent("t")).toEqual({ type: "toggle", what: "readme" });
    expect(keyToIntent("/")).toEqual({ type: "palette" });
    expect(keyToIntent("k", { meta: true })).toEqual({ type: "palette" });
    expect(keyToIntent("k", { ctrl: true })).toEqual({ type: "palette" });
    expect(keyToIntent("Enter")).toEqual({ type: "terminal" });
  });

  it("leaves browser shortcuts, buttons and text fields alone", () => {
    expect(keyToIntent("l", { ctrl: true })).toBeNull();
    expect(keyToIntent("Enter", { inControl: true })).toBeNull();
    expect(keyToIntent("PageUp", { inText: true })).toBeNull();
    expect(keyToIntent("k", { meta: true, inText: true })).toBeNull();
    expect(keyToIntent("q")).toBeNull();
  });
});

describe("wheel gate", () => {
  it("fires once per continuous gesture", () => {
    const gate = createWheelGate();
    const fired = [];
    for (let t = 0; t < 2000; t += 16) {
      const r = gate(-30, t);
      if (r) fired.push(r);
    }
    expect(fired).toEqual(["up"]);
  });

  it("fires again for a new gesture after the cooldown", () => {
    const gate = createWheelGate();
    expect(gate(120, 0)).toBe("down");
    expect(gate(120, 300)).toBeNull();
    expect(gate(120, 1100)).toBe("down");
  });

  it("ignores tiny deltas", () => {
    const gate = createWheelGate();
    expect(gate(5, 0)).toBeNull();
    expect(gate(5, 500)).toBeNull();
  });
});

describe("swipes", () => {
  it("detects fast vertical swipes as elevator steps", () => {
    expect(classifySwipe({ dx: 4, dy: -120, ms: 200 })).toEqual({ kind: "elevator", dir: "up" });
    expect(classifySwipe({ dx: -10, dy: 90, ms: 300 })).toEqual({ kind: "elevator", dir: "down" });
  });

  it("rejects slow or short vertical swipes", () => {
    expect(classifySwipe({ dx: 0, dy: -120, ms: 600 })).toBeNull();
    expect(classifySwipe({ dx: 0, dy: -40, ms: 100 })).toBeNull();
  });

  it("detects taps and horizontal scrubs", () => {
    expect(classifySwipe({ dx: 2, dy: 3, ms: 120 })).toEqual({ kind: "tap" });
    expect(classifySwipe({ dx: 80, dy: 10, ms: 300 })).toEqual({ kind: "scrub", dx: 80 });
  });
});

describe("joystick dead zone", () => {
  it("zeros input inside 12% and rescales outside", () => {
    expect(applyDeadZone(0.1, 0)).toEqual({ x: 0, y: 0 });
    expect(applyDeadZone(1, 0).x).toBeCloseTo(1);
    const mid = applyDeadZone(0, 0.56);
    expect(mid.y).toBeCloseTo(0.5);
    const capped = applyDeadZone(2, 0);
    expect(capped.x).toBe(1);
  });
});
