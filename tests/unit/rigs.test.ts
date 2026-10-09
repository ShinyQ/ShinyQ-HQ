import { describe, expect, it } from "vitest";
import {
  clampYaw,
  clampZoom,
  followPose,
  forwardOf,
  INTRO_DURATION,
  INTRO_SWEEP,
  introAngle,
  introPose,
  MAX_YAW,
  railPose,
  railShift,
  selectRig,
  springFactor,
} from "@/experience/camera/rigs";

describe("camera rigs", () => {
  it("selects intro, rail on L2 and follow elsewhere", () => {
    expect(selectRig("boot", "L1")).toBe("intro");
    expect(selectRig("intro", "L1")).toBe("intro");
    expect(selectRig("explore", "L2")).toBe("rail");
    expect(selectRig("elevator", "L3")).toBe("follow");
    expect(selectRig("explore", "RF")).toBe("follow");
  });

  it("uses the follow offsets per camera class", () => {
    expect(followPose("desktop", [0, 0, 0])).toEqual({ position: [14, 15, 14], target: [0, 0, 0], fov: 38 });
    expect(followPose("tablet", [1, 14, 2]).position).toEqual([17, 32, 18]);
    expect(followPose("mobile", [0, 0, 0]).fov).toBe(50);
  });

  it("applies yaw and zoom to the follow offset", () => {
    const yawed = followPose("desktop", [0, 0, 0], Math.PI / 2);
    expect(yawed.position[0]).toBeCloseTo(14);
    expect(yawed.position[2]).toBeCloseTo(-14);
    expect(followPose("desktop", [0, 0, 0], 0, 1.25).position[1]).toBeCloseTo(18.75);
  });

  it("places the rail camera beside the corridor", () => {
    expect(railPose("desktop", 10, 14)).toEqual({ position: [10, 27, 24], target: [14, 14, 0], fov: 40 });
    expect(railPose("mobile", 0, 0).position).toEqual([0, 18, 34]);
  });

  it("keeps the rail fixed inside the corridor and slides it into side rooms", () => {
    expect(railShift(0)).toBe(0);
    expect(railShift(3.9)).toBe(0);
    expect(railShift(-4)).toBe(0);
    expect(railShift(10)).toBe(6);
    expect(railShift(-19)).toBe(-15);
    expect(railPose("desktop", 10, 14, 1, 2)).toEqual(railPose("desktop", 10, 14));
    const inRoom = railPose("desktop", 10, 14, 1, -14);
    expect(inRoom.position[2]).toBe(24 - 10);
    expect(inRoom.target[2]).toBe(-10);
  });

  it("orbits 120 degrees during the intro and lands on the follow pose", () => {
    const end = followPose("desktop", [0, 0, 6]);
    expect(introAngle(end, 1) - introAngle(end, 0)).toBeCloseTo(INTRO_SWEEP);
    const first = introPose("desktop", 0, end);
    expect(Math.hypot(first.position[0], first.position[2])).toBeCloseTo(70);
    const last = introPose("desktop", INTRO_DURATION, end);
    expect(last.position[0]).toBeCloseTo(end.position[0]);
    expect(last.position[1]).toBeCloseTo(end.position[1]);
    expect(last.target[2]).toBeCloseTo(6);
    expect(INTRO_DURATION).toBeCloseTo(2.5);
  });

  it("smooths with a 0.18 s half-life spring", () => {
    expect(springFactor(0.18)).toBeCloseTo(0.5);
    expect(springFactor(0)).toBe(0);
  });

  it("derives the horizontal forward and clamps yaw and zoom", () => {
    const f = forwardOf(followPose("desktop", [0, 0, 0]));
    expect(f.x).toBeCloseTo(-Math.SQRT1_2);
    expect(f.z).toBeCloseTo(-Math.SQRT1_2);
    expect(clampYaw(1)).toBe(MAX_YAW);
    expect(clampZoom(2)).toBe(1.25);
    expect(clampZoom(0.1)).toBe(0.8);
  });
});
