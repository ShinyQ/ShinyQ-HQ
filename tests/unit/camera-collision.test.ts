import { describe, expect, it } from "vitest";
import { CAMERA_CLEARANCE, cameraBlocked, clampCamera, type CameraWorld } from "@/experience/camera/collision";
import { followPose, railPose, type Vec3 } from "@/experience/camera/rigs";
import { buildFloorLayouts } from "@/experience/config";

const world: CameraWorld = {
  floorY: 0,
  bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
  obstacles: [{ minX: 4, maxX: 8, minZ: -2, maxZ: 2 }],
};

describe("camera collision", () => {
  it("never touches a camera above obstacle height (so the default poses never move)", () => {
    const cam: Vec3 = [16, 19, 16];
    expect(clampCamera([0, 1, 0], cam, world)).toBe(cam);
  });

  it("blocks under the floor, low outside the slab and inside obstacles up to their height", () => {
    expect(cameraBlocked([0, 0.2, 0], world)).toBe(true);
    expect(cameraBlocked([30, 1.5, 0], world)).toBe(true);
    expect(cameraBlocked([30, CAMERA_CLEARANCE.edge + 0.1, 0], world)).toBe(false);
    expect(cameraBlocked([6, 2, 0], world)).toBe(true);
    expect(cameraBlocked([4 - CAMERA_CLEARANCE.radius / 2, 2, 0], world)).toBe(true);
    expect(cameraBlocked([0, 2, 0], world)).toBe(false);
  });

  it("pulls a low camera in along the view ray, in front of the first obstacle", () => {
    const out = clampCamera([-2, 1, 0], [12, 2, 0], world, [0, 1, 0]);
    expect(cameraBlocked(out, world)).toBe(false);
    expect(out[0]).toBeLessThanOrEqual(4 - CAMERA_CLEARANCE.radius + 1e-6);
    expect(out[0]).toBeGreaterThan(3.4);
    expect(out[2]).toBeCloseTo(0);
    // Same line as before: the view direction does not change.
    expect((out[1] - 1) / (out[0] + 2)).toBeCloseTo((2 - 1) / 14);
  });

  it("keeps a low camera on the slab", () => {
    const out = clampCamera([14, 1, 0], [40, 2, 0], world);
    expect(out[0]).toBeLessThanOrEqual(20 + 1e-6);
    expect(out[0]).toBeGreaterThan(19);
  });

  it("keeps the wanted camera when the ray starts blocked", () => {
    const cam: Vec3 = [6, 1.5, 3];
    expect(clampCamera([6, 1, 0], cam, world)).toBe(cam);
  });

  it("leaves the default follow and L2 cameras alone on every floor", () => {
    const layouts = buildFloorLayouts(8);
    for (const layout of Object.values(layouts)) {
      const w: CameraWorld = { floorY: 0, bounds: layout.bounds, obstacles: layout.obstacles };
      for (const p of [layout.spawn, layout.approach]) {
        const follow = followPose("desktop", [p.x, 1, p.z]);
        expect(clampCamera(follow.target, follow.position, w)).toBe(follow.position);
        const rail = railPose("desktop", p.x, 0, 1, p.z);
        expect(clampCamera(rail.target, rail.position, w)).toBe(rail.position);
      }
    }
  });
});
