import { describe, expect, it } from "vitest";
import { buildFloorLayouts, ROVER } from "@/experience/config";
import { collides } from "@/experience/nav/collision";
import { buildNavGrid, findPath } from "@/experience/nav/navgrid";
import { RoverController } from "@/experience/rover/controller";
import { faceFor, faceFrame, type FaceInput } from "@/experience/rover/faces";
import { cameraRelative, stepRover, type RoverPose, type RoverTuning } from "@/experience/rover/movement";

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
const dt = 1 / 60;

describe("stepRover", () => {
  it("accelerates at 18 u/s2 up to the cap", () => {
    let p = stepRover(start, { x: 0, z: 1 }, 0.1, tuning, open);
    expect(p.speed).toBeCloseTo(1.8);
    for (let i = 0; i < 120; i++) p = stepRover(p, { x: 0, z: 1 }, dt, tuning, open);
    expect(p.speed).toBeCloseTo(9);
    expect(p.z).toBeGreaterThan(10);
  });

  it("brakes at 26 u/s2", () => {
    const moving = { ...start, speed: 9 };
    expect(stepRover(moving, null, 0.1, tuning, open).speed).toBeCloseTo(6.4);
    let p = moving;
    for (let i = 0; i < 30; i++) p = stepRover(p, null, dt, tuning, open);
    expect(p.speed).toBe(0);
  });

  it("caps the turn rate at 3.5 rad/s and turns before driving", () => {
    const p = stepRover(start, { x: 0, z: -1 }, 0.1, tuning, open);
    expect(Math.abs(p.heading)).toBeCloseTo(0.35);
    expect(p.speed).toBe(0);
  });

  it("tilts into turns within 8 degrees", () => {
    let p: RoverPose = { ...start, speed: 9 };
    for (let i = 0; i < 30; i++) p = stepRover(p, { x: 1, z: 0.2 }, dt, tuning, open);
    expect(Math.abs(p.tilt)).toBeGreaterThan(0);
    expect(Math.abs(p.tilt)).toBeLessThanOrEqual(ROVER.maxTilt + 1e-9);
  });

  it("never crosses a wall", () => {
    const wall = { minX: -10, maxX: 10, minZ: 5, maxZ: 6 };
    let p = start;
    for (let i = 0; i < 300; i++) p = stepRover(p, { x: 0, z: 1 }, dt, tuning, { ...open, obstacles: [wall] });
    expect(p.z).toBeCloseTo(4);
    expect(p.blocked).toBe(true);
  });

  it("maps camera-relative input so W points away from the camera", () => {
    const forward = { x: -1, z: -1 };
    const w = cameraRelative({ x: 0, y: 1 }, forward);
    expect(w.x).toBeCloseTo(-Math.SQRT1_2);
    expect(w.z).toBeCloseTo(-Math.SQRT1_2);
    const d = cameraRelative({ x: 1, y: 0 }, { x: 0, z: -1 });
    expect(d.x).toBeCloseTo(1);
    expect(d.z).toBeCloseTo(0);
  });
});

describe("RoverController", () => {
  it("follows a navgrid path through the Lobby and arrives", () => {
    const l1 = buildFloorLayouts(8).L1;
    const grid = buildNavGrid(l1, ROVER.radius);
    const rover = new RoverController(l1.spawn);
    const target = { x: 0, z: -12 };
    rover.setPath(findPath(grid, l1.spawn, target)!);
    let arrived = false;
    for (let i = 0; i < 60 * 10 && !arrived; i++) {
      arrived = rover.update(dt, null, { tuning, autopilotSpeed: ROVER.autopilotSpeed, world: l1 }).arrived;
      expect(collides(rover.pose, ROVER.radius - 0.05, l1.obstacles)).toBe(false);
    }
    expect(arrived).toBe(true);
    expect(Math.hypot(rover.pose.x - target.x, rover.pose.z - target.z)).toBeLessThan(0.8);
  });

  it("cancels the path on manual input", () => {
    const rover = new RoverController({ x: 0, z: 0 });
    rover.setPath([{ x: 10, z: 0 }], true);
    rover.update(dt, { x: 0, z: 1 }, { tuning, autopilotSpeed: 12, world: open });
    expect(rover.following).toBe(false);
    expect(rover.autopilot).toBe(false);
  });

  it("sub-steps long frames so walls still stop the rover", () => {
    const wall = { minX: -10, maxX: 10, minZ: 5, maxZ: 6 };
    const world = { obstacles: [wall], bounds: open.bounds };
    const rover = new RoverController({ x: 0, z: 0 }, 0);
    rover.pose.speed = 12;
    for (let i = 0; i < 20; i++) rover.step(0.25, { x: 0, z: 1 }, { tuning: { ...tuning, maxSpeed: 12 }, autopilotSpeed: 12, world });
    expect(rover.pose.z).toBeLessThan(4.01);
  });

  it("caps very long frames", () => {
    const rover = new RoverController({ x: 0, z: 0 }, 0);
    rover.step(5, { x: 0, z: 1 }, { tuning, autopilotSpeed: 12, world: open });
    expect(rover.pose.z).toBeLessThan(9 * 0.25 + 1e-6);
  });

  it("uses the autopilot speed when on autopilot", () => {
    const rover = new RoverController({ x: 0, z: 0 }, 0);
    rover.setPath([{ x: 0, z: 80 }], true);
    for (let i = 0; i < 120; i++) rover.update(dt, null, { tuning, autopilotSpeed: 12, world: open });
    expect(rover.pose.speed).toBeGreaterThan(10);
  });
});

describe("faces", () => {
  const base: FaceInput = { phase: "explore", speed: 0, autopilot: false, now: 10, blockedUntil: 0, arrivedUntil: 0, ride: null };

  it("picks faces by state", () => {
    expect(faceFor(base)).toBe("idle");
    expect(faceFor({ ...base, speed: 4 })).toBe("driving");
    expect(faceFor({ ...base, speed: 4, autopilot: true })).toBe("autopilot");
    expect(faceFor({ ...base, arrivedUntil: 11 })).toBe("arrived");
    expect(faceFor({ ...base, blockedUntil: 10.5, speed: 4 })).toBe("blocked");
    expect(faceFor({ ...base, phase: "terminal" })).toBe("thinking");
    expect(faceFor({ ...base, ride: "up" })).toBe("up");
  });

  it("draws the face text", () => {
    expect(faceFrame("idle", 0).lines).toEqual(["^_^"]);
    expect(faceFrame("idle", 0, { blinking: true }).lines).toEqual(["-_-"]);
    expect(faceFrame("blocked", 0).lines).toEqual(["o_o"]);
    expect(faceFrame("up", 0).lines).toEqual(["\u25B2"]);
    expect(faceFrame("autopilot", 0, { status: "to L3" }).lines[1]).toBe("to L3");
  });

  it("scrolls while driving and only changes key between frames", () => {
    const a = faceFrame("driving", 0);
    const b = faceFrame("driving", 0.05);
    const c = faceFrame("driving", 0.2);
    expect(a.key).toBe(b.key);
    expect(a.key).not.toBe(c.key);
  });
});
