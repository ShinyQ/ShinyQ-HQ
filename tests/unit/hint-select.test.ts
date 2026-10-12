import { describe, expect, it, vi } from "vitest";
import { labelAnchor } from "@/experience/interact/pick";
import type { Interactable } from "@/experience/hints/source";
import { HINT, hintAnchor, nearestHint } from "@/experience/hints/select";
import { hintRuntime, setHintTarget, subscribeHintTarget } from "@/experience/hints/runtime";

const at = (id: string, x: number, z = 0) => ({ id, at: { x, z } });
const origin = { x: 0, z: 0 };

describe("nearestHint", () => {
  it("picks the nearest target within the radius", () => {
    expect(nearestHint([at("L1:pad:elevator", 4.5), at("L1:kiosk:ask-rover", 3)], origin)?.id).toBe("L1:kiosk:ask-rover");
    expect(nearestHint([at("L1:station:skills", HINT.radius + 0.1)], origin)).toBeNull();
    expect(nearestHint([], origin)).toBeNull();
  });

  it("keeps the current bubble until another target is clearly nearer or it leaves the keep radius", () => {
    const a = at("a", 3);
    const b = at("b", -2.8);
    expect(nearestHint([a, b], origin, a)?.id).toBe("a");
    const c = at("c", -1);
    expect(nearestHint([a, c], origin, a)?.id).toBe("c");
    const drifting = at("a", 5.5);
    expect(nearestHint([drifting], origin, drifting)?.id).toBe("a");
    expect(nearestHint([at("a", 6.5)], origin, a)).toBeNull();
  });
});

describe("hintAnchor", () => {
  it("floats above point-and-go's hover label, so the two never overlap", () => {
    const pad = { kind: "elevator-pad" as const, at: { x: 3, z: 0 } };
    const [lx, ly, lz] = labelAnchor(pad);
    const anchor = hintAnchor(pad, 14);
    expect(anchor.x).toBe(lx);
    expect(anchor.z).toBe(lz);
    expect(anchor.y).toBeCloseTo(14 + ly + HINT.lift);
  });
});

describe("hint runtime", () => {
  it("notifies only when the picked target changes", () => {
    const item = { id: "L1:pad:elevator" } as Interactable;
    const listener = vi.fn();
    const off = subscribeHintTarget(listener);
    setHintTarget({ item, anchor: { x: 0, y: 0, z: 0 } });
    setHintTarget({ item, anchor: { x: 1, y: 0, z: 0 } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(hintRuntime.target?.anchor.x).toBe(1);
    setHintTarget(null);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });
});
