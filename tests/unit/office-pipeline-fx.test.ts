import { describe, expect, it } from "vitest";
import { PIPE_GLOW, PIPE_PARTS } from "@/experience/floors/lobby/office/crewFx";
import { arcLift, arcPoint, FX_CEILING, PIPE_FX, PipelineFx } from "@/experience/floors/lobby/office/pipelineFx";
import { officeInstances } from "@/experience/floors/lobby/office/officeRig";

const glow = () => ({ m: new Float32Array(officeInstances().glow * 16), c: new Float32Array(officeInstances().glow * 3) });
const parts = () => new Float32Array(officeInstances().parts * 16);
const scaleAt = (m: Float32Array, i: number) => Math.hypot(m[i * 16], m[i * 16 + 1], m[i * 16 + 2]);
const yAt = (m: Float32Array, i: number) => m[i * 16 + 13];

describe("office pipeline visuals", () => {
  it("arcs from start to end and never over the wall's top", () => {
    const a = { x: 0, y: 2, z: 0 };
    const b = { x: 10, y: 4.6, z: 4 };
    const out = { x: 0, y: 0, z: 0 };
    expect(arcPoint(a, b, 0, 2, out)).toEqual(a);
    expect(arcPoint(a, b, 1, 2, out)).toEqual(b);
    const lift = arcLift(a, b, Infinity);
    for (let u = 0; u <= 1; u += 0.05) expect(arcPoint(a, b, u, lift, out).y).toBeLessThanOrEqual(FX_CEILING + 1e-9);
  });

  it("a burst grows a ring of 8 dots for 0.6 s, then nothing is drawn and the key goes still", () => {
    const fx = new PipelineFx();
    const g = glow();
    fx.play({ kind: "burst", lane: 5, ok: false, at: 0 }, 10, false);
    fx.write(10.3, 0, false, false, g.m, g.c, parts());
    const ring = PIPE_GLOW.start + PIPE_GLOW.packets * PIPE_GLOW.packetDots;
    expect(Array.from({ length: 8 }, (_, i) => scaleAt(g.m, ring + i) > 0)).toEqual(Array(8).fill(true));
    fx.write(10 + PIPE_FX.burst.s + 0.01, 0, false, false, g.m, g.c, parts());
    expect(scaleAt(g.m, ring)).toBe(0);
    expect(fx.key(11, 0, false, false)).toBe(fx.key(12, 0, false, false));
  });

  it("flies a package from a desk to the dock, then stacks today's merges (at most 12); reduced motion only stacks", () => {
    const fx = new PipelineFx();
    const p = parts();
    const g = glow();
    fx.play({ kind: "package", from: 7, key: "pr:x#1", at: 0 }, 0, false);
    for (let t = 0; t <= PIPE_FX.package.s; t += 0.1) {
      fx.write(t, 3, false, false, g.m, g.c, p);
      expect(yAt(p, 100)).toBeLessThanOrEqual(FX_CEILING + 1e-9);
    }
    fx.write(PIPE_FX.package.s + 0.1, 20, false, false, g.m, g.c, p);
    expect(scaleAt(p, 100)).toBe(0);
    expect(Array.from({ length: PIPE_PARTS.stack }, (_, i) => scaleAt(p, 101 + i) > 0).filter(Boolean)).toHaveLength(12);
    const still = new PipelineFx();
    still.play({ kind: "package", from: 7, key: "pr:x#2", at: 0 }, 0, true);
    still.write(0, 2, false, true, g.m, g.c, p);
    expect(scaleAt(p, 100)).toBe(0);
    expect(still.key(0, 2, false, true)).toBe(still.key(5, 2, false, true));
  });

  it("counts what played for the probe and skips packets, bursts and the crown under reduced motion", () => {
    const fx = new PipelineFx();
    fx.play({ kind: "packet", from: 2, at: 0 }, 0, false);
    fx.play({ kind: "burst", lane: 0, ok: true, at: 0 }, 0, true);
    fx.play({ kind: "crown", ok: true, at: 0 }, 0, true);
    expect(fx.counts).toMatchObject({ packets: 1, bursts: 0, crowns: 0 });
  });
});
