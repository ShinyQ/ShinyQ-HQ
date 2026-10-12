import { describe, expect, it } from "vitest";
import { ROVER } from "@/experience/config";
import { joystick, setBoost } from "@/experience/input/joystick";
import { BOOST, boostOn, boostTuning, stepBoostLevel } from "@/experience/rover/boost";
import { MAX_PHYSICS_STEP, physicsSteps, RoverController } from "@/experience/rover/controller";
import { stepRover, type RoverPose, type RoverTuning } from "@/experience/rover/movement";

const tuning: RoverTuning = {
  maxSpeed: ROVER.maxSpeedFine,
  accel: ROVER.accel,
  braking: ROVER.braking,
  turnRate: ROVER.turnRate,
  radius: ROVER.radius,
  maxTilt: ROVER.maxTilt,
};
const open = { obstacles: [], bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 } };
const start: RoverPose = { x: 0, z: 0, heading: 0, speed: 0, tilt: 0 };
const ahead = { x: 0, z: 1 };

describe("boost", () => {
  it("is on only while driving by hand with Shift or the touch button held", () => {
    expect(boostOn(ahead, ["w"], false)).toBe(false);
    expect(boostOn(ahead, ["w", "shift"], false)).toBe(true);
    expect(boostOn(ahead, ["Shift"], false)).toBe(true);
    expect(boostOn(ahead, [], true)).toBe(true);
    // Autopilot (missions, walks, elevator approach, point-and-go drives) has no manual input.
    expect(boostOn(null, ["shift"], true)).toBe(false);
    expect(boostOn({ x: 0, z: 0 }, ["shift"], true)).toBe(false);
  });

  it("doubles top speed and acceleration and leaves the rest alone", () => {
    expect(boostTuning(tuning, false)).toBe(tuning);
    expect(boostTuning(tuning, true)).toEqual({
      ...tuning,
      maxSpeed: ROVER.maxSpeedFine * BOOST.multiplier,
      accel: ROVER.accel * BOOST.multiplier,
    });
  });

  it("reaches about twice the cruising speed", () => {
    let p = start;
    for (let i = 0; i < 120; i++) p = stepRover(p, ahead, 1 / 60, boostTuning(tuning, true), open);
    expect(p.speed).toBeCloseTo(18);
  });

  it("eases the trail level in within half a second and out within two", () => {
    let level = 0;
    for (let i = 0; i < 30; i++) level = stepBoostLevel(level, true, 1 / 60);
    expect(level).toBeGreaterThan(0.9);
    for (let i = 0; i < 30; i++) level = stepBoostLevel(level, true, 1 / 60);
    expect(level).toBe(1);
    for (let i = 0; i < 120; i++) level = stepBoostLevel(level, false, 1 / 60);
    expect(level).toBe(0);
  });

  it("shares the touch button state through the joystick module", () => {
    setBoost(true);
    expect(joystick.boost).toBe(true);
    setBoost(false);
    expect(joystick.boost).toBe(false);
  });
});

describe("physics sub-steps", () => {
  it("splits long or fast frames so no sub-step covers more than 0.4 u", () => {
    expect(physicsSteps(1 / 60, 9)).toBe(1);
    expect(physicsSteps(0.25, 9)).toBe(Math.ceil(0.25 / MAX_PHYSICS_STEP));
    expect(physicsSteps(0.25, 18)).toBe(12);
    expect(physicsSteps(0, 18)).toBe(1);
  });

  it("never tunnels through a thin wall at boost speed on slow frames", () => {
    const wall = { minX: -10, maxX: 10, minZ: 5, maxZ: 5.1 };
    const rover = new RoverController({ x: 0, z: 0 }, 0);
    rover.pose = { ...rover.pose, speed: 18 };
    const ctx = { tuning: boostTuning(tuning, true), autopilotSpeed: ROVER.autopilotSpeed, world: { obstacles: [wall], bounds: open.bounds } };
    for (let i = 0; i < 12; i++) rover.step(0.25, ahead, ctx);
    expect(rover.pose.z).toBeLessThanOrEqual(4 + 1e-6);
  });
});
