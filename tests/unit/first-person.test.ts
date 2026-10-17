import { describe, expect, it } from "vitest";
import {
  blendPoses,
  CAMERA_NEAR,
  ceilingOpacity,
  easeBlend,
  FIRST_PERSON,
  FIRST_PERSON_FOV,
  firstPersonPose,
  roverOpacity,
  viewSuspended,
} from "@/experience/camera/firstPerson";
import type { CameraPose } from "@/experience/camera/rigs";

describe("first-person pose", () => {
  it("puts the eye at the rover's face and looks along the forward", () => {
    const pose = firstPersonPose("desktop", [2, 14, 3], { x: 0, z: -2 }, 0);
    expect(pose.position).toEqual([2, 14 + FIRST_PERSON.eyeHeight, 3]);
    expect(pose.target[0]).toBeCloseTo(2);
    expect(pose.target[1]).toBeCloseTo(14 + FIRST_PERSON.eyeHeight);
    expect(pose.target[2]).toBeCloseTo(3 - FIRST_PERSON.lookDistance);
    expect(pose.fov).toBe(FIRST_PERSON_FOV.desktop);
  });

  it("looks down and up within the limits; the eye never leaves the rover's height", () => {
    const down = firstPersonPose("mobile", [0, 0, 0], { x: 1, z: 0 }, FIRST_PERSON.pitch[0]);
    expect(down.target[1]).toBeLessThan(down.position[1]);
    expect(down.position[1]).toBe(FIRST_PERSON.eyeHeight);
    const up = firstPersonPose("mobile", [0, 0, 0], { x: 1, z: 0 }, FIRST_PERSON.pitch[1]);
    expect(up.target[1]).toBeGreaterThan(up.position[1]);
    expect(FIRST_PERSON.pitch[0]).toBeGreaterThan(-Math.PI / 2);
    expect(FIRST_PERSON.near).toBeLessThan(CAMERA_NEAR);
  });
});

describe("glide", () => {
  const a: CameraPose = { position: [0, 10, 0], target: [0, 0, 0], fov: 40 };
  const b: CameraPose = { position: [10, 0, 0], target: [20, 0, 0], fov: 60 };

  it("eases with a soft start and landing", () => {
    expect(easeBlend(0)).toBe(0);
    expect(easeBlend(1)).toBe(1);
    expect(easeBlend(-1)).toBe(0);
    expect(easeBlend(2)).toBe(1);
    expect(easeBlend(0.5)).toBeCloseTo(0.5);
    expect(easeBlend(0.1)).toBeLessThan(0.1);
  });

  it("is the third-person pose at 0 and the eye at 1", () => {
    expect(blendPoses(a, b, 0)).toEqual(a);
    expect(blendPoses(a, b, 1)).toEqual(b);
    expect(blendPoses(a, b, 0.5).fov).toBeCloseTo(50);
  });

  it("fades the ghost floors above out with the glide (no ceiling in first person)", () => {
    expect(ceilingOpacity(0)).toBe(1);
    expect(ceilingOpacity(1)).toBe(0);
    expect(ceilingOpacity(0.5)).toBeCloseTo(0.5);
  });

  it("fades the rover body only in the last part of the glide", () => {
    expect(roverOpacity(0)).toBe(1);
    expect(roverOpacity(FIRST_PERSON.fadeFrom)).toBe(1);
    expect(roverOpacity(FIRST_PERSON.fadeTo)).toBe(0);
    expect(roverOpacity(1)).toBe(0);
    for (let t = 0; t < 1; t += 0.05) expect(roverOpacity(t + 0.05)).toBeLessThanOrEqual(roverOpacity(t));
  });
});

describe("holding third person", () => {
  const idle = { phase: "explore", ride: false, beam: false, mission: false, driving: false };

  it("keeps first person while exploring and under the Rover menu or the palette", () => {
    expect(viewSuspended(idle)).toBe(false);
    expect(viewSuspended({ ...idle, phase: "terminal" })).toBe(false);
    expect(viewSuspended({ ...idle, phase: "palette" })).toBe(false);
  });

  it("holds third person for rides, beams, missions, autopilot, rooms, the hologram and the intro", () => {
    for (const phase of ["boot", "intro", "room", "hologram", "elevator", "autopilot", "static"]) expect(viewSuspended({ ...idle, phase })).toBe(true);
    expect(viewSuspended({ ...idle, ride: true })).toBe(true);
    expect(viewSuspended({ ...idle, beam: true })).toBe(true);
    expect(viewSuspended({ ...idle, mission: true })).toBe(true);
    expect(viewSuspended({ ...idle, driving: true })).toBe(true);
  });
});
