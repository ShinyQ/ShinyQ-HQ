import { describe, expect, it } from "vitest";
import { boostView, BOOST_VIEW } from "@/experience/camera/boostView";
import { MAX_FRAME_DT } from "@/experience/rover/controller";
import { BODY, createBodyState, springStep, stepBody } from "@/experience/rover/bodyDynamics";

const dt = 1 / 60;
const base = { dt, t: 0, enabled: true, buzz: false, topSpeed: 18 };

describe("critically damped spring", () => {
  it("converges to the target without overshoot", () => {
    const s = { x: 0, v: 0 };
    let max = 0;
    for (let i = 0; i < 120; i++) {
      springStep(s, 1, 12, dt);
      max = Math.max(max, s.x);
    }
    expect(s.x).toBeCloseTo(1, 3);
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("stays stable on the longest frame and does nothing at dt 0", () => {
    const s = { x: 2, v: -5 };
    springStep(s, 0, 12, 0);
    expect(s).toEqual({ x: 2, v: -5 });
    for (let i = 0; i < 20; i++) springStep(s, 0, 12, MAX_FRAME_DT);
    expect(Math.abs(s.x)).toBeLessThan(1e-3);
    expect(Number.isFinite(s.v)).toBe(true);
  });
});

describe("body dynamics", () => {
  it("leaves normal (unboosted) driving untouched", () => {
    const s = createBodyState();
    let speed = 0;
    for (let i = 0; i < 120; i++) {
      speed = Math.min(9, speed + 18 * dt);
      stepBody(s, { ...base, speed, heading: i * 0.05, level: 0, t: i * dt });
    }
    expect(s.pitch.x).toBe(0);
    expect(s.roll.x).toBe(0);
    expect(s.buzzY).toBe(0);
  });

  it("squats (nose up) when the boost kicks in and dips (nose down) when braking", () => {
    const s = createBodyState();
    let speed = 9;
    stepBody(s, { ...base, speed, heading: 0, level: 0 });
    let minPitch = 0;
    for (let i = 0; i < 20; i++) {
      speed = Math.min(18, speed + 36 * dt);
      stepBody(s, { ...base, speed, heading: 0, level: Math.min(1, i / 4) });
      minPitch = Math.min(minPitch, s.pitch.x);
    }
    expect(minPitch).toBeLessThan(-0.02);
    expect(minPitch).toBeGreaterThanOrEqual(-BODY.maxSquat - 1e-9);
    let maxPitch = 0;
    for (let i = 0; i < 20; i++) {
      speed = Math.max(0, speed - 26 * dt);
      stepBody(s, { ...base, speed, heading: 0, level: 0.6 });
      maxPitch = Math.max(maxPitch, s.pitch.x);
    }
    expect(maxPitch).toBeGreaterThan(0.01);
    expect(maxPitch).toBeLessThanOrEqual(BODY.maxDip + 1e-9);
  });

  it("leans into turns with yaw rate times speed, the same way as the base tilt", () => {
    const s = createBodyState();
    let heading = 0;
    for (let i = 0; i < 60; i++) {
      heading += 3 * dt;
      stepBody(s, { ...base, speed: 18, heading, level: 1 });
    }
    // Turning left (heading increasing) tilts negative, like movement.ts.
    expect(s.roll.x).toBeLessThan(-0.02);
    expect(Math.abs(s.roll.x)).toBeLessThanOrEqual(BODY.maxRoll + 1e-9);
    const slow = createBodyState();
    heading = 0;
    for (let i = 0; i < 60; i++) {
      heading += 3 * dt;
      stepBody(slow, { ...base, speed: 6, heading, level: 1 });
    }
    expect(Math.abs(slow.roll.x)).toBeLessThan(Math.abs(s.roll.x));
  });

  it("buzzes only at top boost speed with buzz on, and relaxes when disabled", () => {
    const s = createBodyState();
    let moved = 0;
    for (let i = 0; i < 30; i++) {
      stepBody(s, { ...base, buzz: true, speed: 18, heading: 0, level: 1, t: i * 0.013 });
      moved = Math.max(moved, Math.abs(s.buzzY));
    }
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(BODY.buzzAmp);
    for (let i = 0; i < 60; i++) stepBody(s, { ...base, enabled: false, buzz: true, speed: 18, heading: i, level: 1, t: i * 0.013 });
    expect(s.buzzY).toBe(0);
    expect(Math.abs(s.pitch.x)).toBeLessThan(1e-3);
    expect(Math.abs(s.roll.x)).toBeLessThan(1e-3);
  });
});

describe("camera boost view", () => {
  it("widens and pulls back in third person, kicks less in first person, nothing when off", () => {
    const out = { fovKick: 0, pull: 1 };
    boostView(1, 0, true, out);
    expect(out.fovKick).toBeCloseTo(BOOST_VIEW.fovThird);
    expect(out.pull).toBeCloseTo(1 + BOOST_VIEW.pull);
    boostView(1, 1, true, out);
    expect(out.fovKick).toBeCloseTo(BOOST_VIEW.fovFirst);
    expect(out.pull).toBe(1);
    boostView(1, 0, false, out);
    expect(out).toEqual({ fovKick: 0, pull: 1 });
    boostView(0, 0, true, out);
    expect(out).toEqual({ fovKick: 0, pull: 1 });
  });
});
