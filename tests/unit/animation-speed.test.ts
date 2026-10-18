import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROVER } from "@/experience/config";
import { RoverController } from "@/experience/rover/controller";
import type { RoverTuning } from "@/experience/rover/movement";
import { animationSpeed, MAX_ANIMATION_SPEED } from "@/experience/scene/animationSpeed";
import { advanceRide, PREPARE_TIMEOUT, RIDE_CAP, type Ride } from "@/experience/tower/elevator";

const ROOT = path.resolve(__dirname, "../..");

function automation(webdriver: boolean, speed?: unknown) {
  vi.stubGlobal("navigator", { webdriver });
  vi.stubGlobal("window", speed === undefined ? {} : { __hqE2ESpeed: speed });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("animationSpeed", () => {
  it("is 1 without a window (server render, Vitest)", () => {
    expect(animationSpeed()).toBe(1);
  });

  it("is 1 for visitors, even with the flag set (no navigator.webdriver)", () => {
    automation(false, 4);
    expect(animationSpeed()).toBe(1);
  });

  it("is 1 under automation without the e2e flag (Lighthouse, the perf lane)", () => {
    automation(true);
    expect(animationSpeed()).toBe(1);
  });

  it("reads the e2e flag under automation, clamped to MAX_ANIMATION_SPEED", () => {
    automation(true, 4);
    expect(animationSpeed()).toBe(4);
    automation(true, 100);
    expect(animationSpeed()).toBe(MAX_ANIMATION_SPEED);
  });

  it("ignores a flag that is not a number above 1", () => {
    for (const bad of [0.5, 0, -2, Number.NaN, "4", null, true]) {
      automation(true, bad);
      expect(animationSpeed(), String(bad)).toBe(1);
    }
  });
});

describe("advanceRide speed", () => {
  const ride = (over: Partial<Ride>): Ride => ({ from: "L1", to: "L2", stage: "moving", t: 0, ...over });

  it("multiplies the capped stage time", () => {
    const slow = 0.5;
    const one = advanceRide(ride({}), slow, { atDoor: false, reduced: false, cap: RIDE_CAP.max });
    const four = advanceRide(ride({}), slow, { atDoor: false, reduced: false, cap: RIDE_CAP.max, speed: 4 });
    expect(one?.t).toBeCloseTo(RIDE_CAP.max);
    expect(four?.t).toBeCloseTo(4 * RIDE_CAP.max);
  });

  it("keeps the closed-door wait on real frame time, so the car still waits for the floor", () => {
    const closing = ride({ stage: "closing", t: 0.19 });
    const next = advanceRide(closing, 0.1, { atDoor: false, reduced: false, ready: false, cap: RIDE_CAP.max, speed: 4 });
    expect(next?.stage).toBe("closing");
    expect(next?.held).toBeCloseTo(0.1);
    const waited = advanceRide(next!, 0.1, { atDoor: false, reduced: false, ready: false, cap: RIDE_CAP.max, speed: 4 });
    expect(waited?.held).toBeCloseTo(0.2);
    expect(waited!.held!).toBeLessThan(PREPARE_TIMEOUT);
    const held = advanceRide(waited!, 0.1, { atDoor: false, reduced: false, ready: false, hold: true, cap: RIDE_CAP.max, speed: 4 });
    expect(held?.chunkHeld).toBeCloseTo(0.1);
  });
});

describe("RoverController speed", () => {
  const tuning: RoverTuning = { maxSpeed: ROVER.maxSpeedFine, accel: ROVER.accel, braking: ROVER.braking, turnRate: ROVER.turnRate, radius: ROVER.radius, maxTilt: ROVER.maxTilt };
  const world = { obstacles: [], bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 } };
  const ctx = { tuning, autopilotSpeed: ROVER.autopilotSpeed, world };

  it("drives a frame at 4x like four frames at 1x, in sub-steps", () => {
    const one = new RoverController({ x: 0, z: 0 }, 0);
    one.setPath([{ x: 0, z: 100 }], true);
    for (let i = 0; i < 4; i++) one.step(0.1, null, ctx);
    const four = new RoverController({ x: 0, z: 0 }, 0);
    four.setPath([{ x: 0, z: 100 }], true);
    four.step(0.1, null, { ...ctx, speed: 4 });
    expect(four.pose.z).toBeGreaterThan(0);
    expect(four.pose.z).toBeCloseTo(one.pose.z, 0);
  });
});

describe("e2e animation speed stays out of the perf lane and the memory gates", () => {
  const realSpeed = [
    ...readdirSync(path.join(ROOT, "e2e/perf"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `e2e/perf/${f}`),
    "e2e/memory.spec.ts",
    "e2e/gpu.spec.ts",
    "e2e/ride.spec.ts",
  ];

  it.each(realSpeed)("%s never opts in", (file) => {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    expect(text).not.toMatch(/fastAnimations|realAnimations|setAnimationSpeed|__hqE2ESpeed/);
  });

  it("the fixture is a no-op under PERF=1", () => {
    const hq = readFileSync(path.join(ROOT, "e2e/hq.ts"), "utf8");
    expect(hq).toMatch(/ANIMATION_SPEED = process\.env\.PERF \? 1/);
    expect(hq).toMatch(/fastAnimations\([^)]*\) \{\n {2}if \(process\.env\.PERF\) return;/);
  });
});
