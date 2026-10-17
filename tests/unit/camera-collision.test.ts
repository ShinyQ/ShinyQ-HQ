import { describe, expect, it } from "vitest";
import { CAMERA_CLEARANCE, cameraBlocked, cameraWorld, clampCamera, SHAFT_COLUMN, viewOnSlab, type CameraWorld } from "@/experience/camera/collision";
import { CAMERA_NEAR, FIRST_PERSON, FIRST_PERSON_FOV } from "@/experience/camera/firstPerson";
import { FOLLOW_LOOK_AHEAD, followForward, followPose, railPose, type Vec3 } from "@/experience/camera/rigs";
import { zoneAt, zoneView } from "@/experience/camera/orbit";
import { FLOOR_GAP, SHAFT, SHAFT_EAST_FACE } from "@/experience/config";
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

  it("still clamps when the ray starts inside an obstacle next to the rover (the look-ahead ray crosses the L1 kiosk)", () => {
    // The rover stands just east of a column; the ray from the look-ahead point to the camera crosses the column next to it.
    const kiosk: CameraWorld = { ...world, obstacles: [{ minX: -5, maxX: -1.5, minZ: 0.2, maxZ: 4 }] };
    const rover: Vec3 = [0, 1, 0];
    const target: Vec3 = [-5, 1, -3];
    const cam: Vec3 = [16.7, 3.6, 34];
    const out = clampCamera(target, cam, kiosk, rover, 40);
    expect(out).not.toBe(cam);
    expect(cameraBlocked(out, kiosk)).toBe(false);
    expect(viewOnSlab(out, target, kiosk, 40)).toBe(true);
    // Without the FOV rule the plain clamp still keeps it on the slab below the edge clearance.
    const low: Vec3 = [16.7, 2.2, 34];
    expect(cameraBlocked(clampCamera(target, low, kiosk, rover), kiosk)).toBe(false);
  });

  it("blocks a low camera behind a tall wall up to the wall's height", () => {
    const tall: CameraWorld = { ...world, tall: [{ minX: -12, maxX: -11, minZ: -4, maxZ: 4, h: 9.5 }] };
    expect(cameraBlocked([-11.5, 6, 0], tall)).toBe(true);
    expect(cameraBlocked([-11.5, 9.6, 0], tall)).toBe(false);
    const out = clampCamera([-2, 1, 0], [-18, 6, 0], tall, [0, 1, 0]);
    expect(out[0]).toBeGreaterThan(-11 + CAMERA_CLEARANCE.radius - 0.2);
    expect(cameraBlocked(out, tall)).toBe(false);
    const high: Vec3 = [-18, 12, 0];
    expect(clampCamera([-2, 1, 0], high, tall)).toBe(high);
  });

  it("leaves the default follow and L2 cameras alone on every floor", () => {
    const layouts = buildFloorLayouts(8);
    for (const layout of Object.values(layouts)) {
      const w: CameraWorld = { floorY: 0, bounds: layout.bounds, obstacles: layout.obstacles };
      for (const p of [layout.spawn, layout.approach]) {
        const follow = followPose("desktop", [p.x, 1, p.z]);
        expect(clampCamera(follow.target, follow.position, w, follow.target, follow.fov)).toBe(follow.position);
        // The L2 rail view stands beside the narrow road by design: it takes no FOV (no view rule).
        const rail = railPose("desktop", p.x, 0, 1, p.z);
        expect(clampCamera(rail.target, rail.position, w)).toBe(rail.position);
      }
    }
  });

  it("pulls a low camera off the slab edge back until the bottom of its view lands on the slab", () => {
    // A low view (about 3.5 degrees) from outside the east edge (x = 20), looking west at the rover.
    const target: Vec3 = [10, 1, 0];
    const cam: Vec3 = [44, 3.1, 0];
    expect(cameraBlocked(cam, world)).toBe(false);
    expect(viewOnSlab(cam, target, world, 40)).toBe(false);
    const out = clampCamera(target, cam, world, target, 40);
    expect(viewOnSlab(out, target, world, 40)).toBe(true);
    expect(out[0]).toBeLessThan(28);
    // The same view ray: the camera only moves in.
    expect((out[1] - 1) / (out[0] - 10)).toBeCloseTo((3.1 - 1) / 34);
    // Above obstacle height the plain rule (no FOV, as for the first-person mix) leaves it off the slab; the view rule does not.
    const higher: Vec3 = [44, 3.6, 0];
    expect(clampCamera(target, higher, world)).toBe(higher);
    expect(viewOnSlab(clampCamera(target, higher, world, target, 40), target, world, 40)).toBe(true);
  });

  it("keeps a high camera outside the slab while the bottom of its view lands on the slab", () => {
    const target: Vec3 = [0, 1, 0];
    const cam: Vec3 = [24, 19, 0];
    expect(viewOnSlab(cam, target, world, 40)).toBe(true);
    expect(clampCamera(target, cam, world, target, 40)).toBe(cam);
    // Far out at the same height the bottom of the view leaves the slab, so it moves in.
    const far: Vec3 = [44, 19, 0];
    expect(viewOnSlab(far, target, world, 40)).toBe(false);
    expect(viewOnSlab(clampCamera(target, far, world, target, 40), target, world, 40)).toBe(true);
  });

  it("keeps the near plane above the floor at the ground clearance for every FOV", () => {
    // The near plane reaches at most near / cos(fov / 2) below the eye (looking down by half the FOV).
    const reach = (near: number, fov: number) => near / Math.cos(((fov / 2) * Math.PI) / 180);
    // Third person (follow, rail, hologram FOVs) with CAMERA_NEAR; first person with its own near plane at eye height.
    for (const fov of [35, 40, 42, 45, 50, 55]) expect(reach(CAMERA_NEAR, fov)).toBeLessThan(CAMERA_CLEARANCE.ground);
    for (const fov of Object.values(FIRST_PERSON_FOV)) expect(reach(FIRST_PERSON.near, fov)).toBeLessThan(FIRST_PERSON.eyeHeight);
  });
});

describe("camera world", () => {
  it("adds the elevator shaft as a column on every floor, so a low camera never ends up inside the glass", () => {
    expect(SHAFT_COLUMN).toEqual({ minX: SHAFT.x - SHAFT.size / 2, maxX: SHAFT_EAST_FACE, minZ: SHAFT.z - SHAFT.size / 2, maxZ: SHAFT.z + SHAFT.size / 2, h: FLOOR_GAP });
    const layouts = buildFloorLayouts(8);
    for (const layout of Object.values(layouts)) {
      const w = cameraWorld(layout, 0);
      expect(w.tall).toContainEqual(SHAFT_COLUMN);
      expect(cameraBlocked([SHAFT.x, 3, SHAFT.z], w)).toBe(true);
    }
    // A low camera west of the L1 door, looking east at the rover, comes in out of the shaft.
    const w = cameraWorld(layouts.L1, 0);
    const target: Vec3 = [-14, 1, 0];
    const out = clampCamera(target, [-30, 3, 0.5], w, [-18, 1, 0], 40);
    expect(out[0]).toBeGreaterThan(SHAFT_EAST_FACE);
    expect(cameraBlocked(out, w)).toBe(false);
  });

  it("leaves every floor's default views alone (follow at its zone view, every class; the L2 rail without the view rule)", () => {
    const layouts = buildFloorLayouts(8);
    let moved = 0;
    let total = 0;
    for (const layout of Object.values(layouts)) {
      const w = cameraWorld(layout, 0);
      const points = [layout.spawn, layout.approach, ...(layout.arrival ? [layout.arrival] : [])];
      for (const p of points) {
        for (const cls of ["desktop", "tablet", "mobile"] as const) {
          total += 1;
          if (layout.id === "L2") {
            const rail = railPose(cls, p.x, 0, 1, p.z);
            if (clampCamera(rail.target, rail.position, w, [p.x, 1, p.z]) !== rail.position) moved += 1;
            continue;
          }
          const zone = zoneAt(layout.id, p, layout.viewZones);
          const view = zone ? zoneView(zone, cls) : { yaw: 0, zoom: undefined };
          const f = followForward(cls, view.yaw);
          const pose = followPose(cls, [p.x + f.x * FOLLOW_LOOK_AHEAD[cls], 1, p.z + f.z * FOLLOW_LOOK_AHEAD[cls]], view.yaw, view.zoom ?? 1);
          if (clampCamera(pose.target, pose.position, w, [p.x, 1, p.z], pose.fov) !== pose.position) moved += 1;
        }
      }
    }
    expect(total).toBeGreaterThan(30);
    expect(moved).toBe(0);
  });
});
