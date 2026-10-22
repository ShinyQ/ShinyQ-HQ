import { afterEach, describe, expect, it, vi } from "vitest";
import { engineHum } from "@/lib/audio/engineHum";
import { humNear, nearGain, REACTOR_HUM } from "@/experience/floors/engine/reactorHum";

const LEVEL = 0.025;

function fakeHum(now = 3) {
  const setTargetAtTime = vi.fn();
  const node = { gain: { setTargetAtTime }, context: { currentTime: now } } as unknown as GainNode;
  return { node, setTargetAtTime };
}

afterEach(() => {
  engineHum.node = null;
  engineHum.level = 0;
});

describe("B1 reactor hum: nearGain", () => {
  it("is 1 at and beyond the outer radius and 1 + boost at the inner radius and closer", () => {
    const { inner, outer, boost } = REACTOR_HUM;
    expect(boost).toBe(1);
    for (const d of [outer, outer + 0.01, 40, 1e6, Infinity]) expect(nearGain(d)).toBe(1);
    for (const d of [inner, inner - 1, 0]) expect(nearGain(d)).toBe(2);
    expect(nearGain((inner + outer) / 2)).toBeCloseTo(1.5, 10);
  });

  it("never rises with distance and stays within 1 to 2 (at most about 6 dB louder)", () => {
    let prev = Infinity;
    for (let d = 0; d <= 40; d += 0.25) {
      const g = nearGain(d);
      expect(g).toBeLessThanOrEqual(prev);
      expect(g).toBeGreaterThanOrEqual(1);
      expect(g).toBeLessThanOrEqual(2);
      prev = g;
    }
    expect(20 * Math.log10(nearGain(0))).toBeCloseTo(6, 0);
  });
});

describe("B1 reactor hum: humNear", () => {
  it("does nothing while no hum plays", () => {
    expect(() => humNear(0)).not.toThrow();
  });

  it("glides the playing hum on its own context's clock, never above twice its resting level", () => {
    const { node, setTargetAtTime } = fakeHum(7);
    engineHum.node = node;
    engineHum.level = LEVEL;
    humNear(0);
    expect(setTargetAtTime).toHaveBeenLastCalledWith(LEVEL * 2, 7, REACTOR_HUM.tau);
    humNear(16);
    expect(setTargetAtTime).toHaveBeenLastCalledWith(LEVEL * 1.5, 7, REACTOR_HUM.tau);
    for (const call of setTargetAtTime.mock.calls) expect(call[0]).toBeLessThanOrEqual(LEVEL * 2);
  });

  it("skips repeats on the same node, rests at Infinity and restarts on a newer layer's node", () => {
    const a = fakeHum();
    engineHum.node = a.node;
    engineHum.level = LEVEL;
    humNear(0);
    humNear(2);
    expect(a.setTargetAtTime).toHaveBeenCalledTimes(1);
    humNear(Infinity);
    expect(a.setTargetAtTime).toHaveBeenLastCalledWith(LEVEL, 3, REACTOR_HUM.tau);
    const b = fakeHum();
    engineHum.node = b.node;
    humNear(Infinity);
    expect(b.setTargetAtTime).toHaveBeenCalledWith(LEVEL, 3, REACTOR_HUM.tau);
  });
});
