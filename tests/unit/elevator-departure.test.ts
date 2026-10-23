import { describe, expect, it } from "vitest";
import { cameraBehindHeading, DEPARTURE_RAIL_YAW, DEPARTURE_YAW, ELEVATOR_DIAGONAL } from "@/experience/camera/arrival";
import { yawLooking } from "@/experience/camera/look";
import { createOrbitState, DEPARTURE_VIEW, primeZone, rotate, stepOrbit, updateZone, wrapPi, type OrbitState, type ViewZone } from "@/experience/camera/orbit";
import { followForward, followPose, railPose } from "@/experience/camera/rigs";

/**
 * The way into the elevator (owner 2026-10-23, "serong kanan"): when a ride starts the camera eases to stand behind the
 * rover and `ELEVATOR_DIAGONAL` to its right as it heads west into the shaft; the arrival view takes over from there.
 */
const WEST = -Math.PI / 2;
/** What `CameraDirector` does on the frame a ride starts. */
const aimDeparture = (s: OrbitState, reduced: boolean, rail = false) => updateZone(s, DEPARTURE_VIEW, reduced, "desktop", rail);
const settle = (s: OrbitState) => {
  for (let i = 0; i < 240; i++) stepOrbit(s, 1 / 60, false);
};

describe("the departure view", () => {
  it("eases the follow camera to behind and to the right of a west-heading rover, level, at zoom 1, with no look offset", () => {
    const s = createOrbitState();
    s.yaw = s.yawTarget = 0.3;
    s.pitch = s.pitchTarget = 0.2;
    s.zoom = s.zoomTarget = 1.3;
    s.lookUp = s.lookUpTarget = 2;
    s.lookRight = s.lookRightTarget = 1;
    aimDeparture(s, false);
    expect(s.zone).toBe(DEPARTURE_VIEW.id);
    expect(s.easing).toBe(true);
    // It eases, it does not cut.
    stepOrbit(s, 1 / 60, false);
    expect(s.yaw).not.toBeCloseTo(DEPARTURE_YAW, 3);
    settle(s);
    expect(s.yaw).toBeCloseTo(DEPARTURE_YAW, 9);
    expect(s.pitch).toBe(0);
    expect(s.zoom).toBe(1);
    expect(s.lookUp).toBe(0);
    expect(s.lookRight).toBe(0);
    for (const cls of ["desktop", "tablet", "mobile"] as const) {
      const pose = followPose(cls, [0, 1, 0], s.yaw);
      // Camera east of the rover and on its right (north, -z, for a rover heading west).
      expect(pose.position[0]).toBeGreaterThan(0);
      expect(pose.position[2]).toBeLessThan(0);
      expect(wrapPi(cameraBehindHeading(pose.position, [0, 1, 0]) - (WEST + ELEVATOR_DIAGONAL))).toBeCloseTo(0, 9);
    }
  });

  it("is the west look turned by the diagonal, taking the nearest way round", () => {
    expect(DEPARTURE_YAW).toBeCloseTo(yawLooking({ x: -1, z: 0 }) + ELEVATOR_DIAGONAL, 12);
    const s = createOrbitState();
    s.yaw = s.yawTarget = 4 * Math.PI + 0.1;
    aimDeparture(s, false);
    expect(Math.abs(s.yawTarget - s.yaw)).toBeLessThanOrEqual(Math.PI);
    expect(wrapPi(s.yawTarget - DEPARTURE_YAW)).toBeCloseTo(0, 9);
  });

  it("turns the L2 rail instead, looking along the view", () => {
    const s = createOrbitState();
    aimDeparture(s, false, true);
    settle(s);
    expect(s.railYaw).toBeCloseTo(DEPARTURE_RAIL_YAW, 9);
    expect(s.zoneRailYaw).toBe(DEPARTURE_RAIL_YAW);
    const pose = railPose("desktop", 10, 0, 1, 0, s.railYaw, 0, 0, true);
    expect(pose.position[0]).toBeGreaterThan(10);
    expect(pose.position[2]).toBeLessThan(0);
    expect(wrapPi(cameraBehindHeading(pose.position, [10, 0, 0]) - (WEST + ELEVATOR_DIAGONAL))).toBeCloseTo(0, 9);
  });

  it("does nothing under reduced motion or in first person", () => {
    const s = createOrbitState();
    s.yaw = s.yawTarget = 0.3;
    aimDeparture(s, true);
    expect(s.yawTarget).toBe(0.3);
    expect(s.easing).toBe(false);
    const f = createOrbitState();
    f.yaw = f.yawTarget = 0.3;
    f.firstPerson = true;
    aimDeparture(f, false);
    expect(f.yawTarget).toBe(0.3);
    expect(f.easing).toBe(false);
  });

  it("matches no rover position (its area is empty)", () => {
    const { area } = DEPARTURE_VIEW;
    expect(area.maxX).toBeLessThan(area.minX);
    expect(area.maxZ).toBeLessThan(area.minZ);
  });

  it("hands over to a hand turn at once", () => {
    const s = createOrbitState();
    aimDeparture(s, false);
    stepOrbit(s, 1 / 60, false);
    rotate(s, 0.2);
    const yaw = s.yaw;
    settle(s);
    expect(s.yaw).toBe(yaw);
    expect(s.suppressedZone).toBe(DEPARTURE_VIEW.id);
  });

  it("hands back to the floor's zones when the ride is cancelled", () => {
    const zone: ViewZone = { id: "L1:skills", area: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, yaw: -Math.PI / 4, zoom: 1.4 };
    const s = createOrbitState();
    aimDeparture(s, false);
    settle(s);
    updateZone(s, zone, false, "desktop");
    settle(s);
    expect(s.zone).toBe(zone.id);
    expect(s.yaw).toBeCloseTo(-Math.PI / 4 + Math.round((DEPARTURE_YAW + Math.PI / 4) / (2 * Math.PI)) * 2 * Math.PI, 9);
    expect(s.zoom).toBeCloseTo(1.4, 9);
  });

  it("eases the L2 rail back to the side view when the ride is cancelled outside a zone", () => {
    const s = createOrbitState();
    aimDeparture(s, false, true);
    settle(s);
    updateZone(s, null, false, "desktop", true);
    settle(s);
    expect(s.zone).toBeNull();
    expect(s.zoneRailYaw).toBeNull();
    expect(wrapPi(s.railYaw)).toBeCloseTo(0, 9);
  });

  it("gives way to the arrival view, primed when the doors open", () => {
    const arrival: ViewZone = { id: "L3:overview", area: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, yaw: 1 };
    const s = createOrbitState();
    aimDeparture(s, false);
    settle(s);
    primeZone(s, arrival, "desktop");
    expect(s.zone).toBe("L3:overview");
    expect(s.yaw).toBe(1);
  });
});

describe("LookOffset.right", () => {
  const zone: ViewZone = { id: "L1:arrival", area: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, yaw: 0.4, classView: { mobile: { zoom: 0.9, lookOffset: { right: 2 } } } };

  it("moves only the follow look target, along the camera's horizontal right, scaled with the zoom", () => {
    const base = followPose("mobile", [3, 1, -2], 0.4, 0.9);
    const aimed = followPose("mobile", [3, 1, -2], 0.4, 0.9, 0, 0, 0, 2);
    expect(aimed.position).toEqual(base.position);
    const f = followForward("mobile", 0.4);
    expect(aimed.target[0] - base.target[0]).toBeCloseTo(-f.z * 2 * 0.9, 12);
    expect(aimed.target[2] - base.target[2]).toBeCloseTo(f.x * 2 * 0.9, 12);
    expect(aimed.target[1]).toBe(base.target[1]);
    // Without one, the very same target array.
    const target: [number, number, number] = [3, 1, -2];
    expect(followPose("mobile", target, 0.4, 0.9).target).toBe(target);
  });

  it("moves only the rail look target, along the rail camera's horizontal right", () => {
    const base = railPose("mobile", 4, 0, 0.8, 0, -1, 0, 0, true);
    const aimed = railPose("mobile", 4, 0, 0.8, 0, -1, 0, 0, true, 7);
    expect(aimed.position).toEqual(base.position);
    const dx = aimed.target[0] - base.target[0];
    const dz = aimed.target[2] - base.target[2];
    expect(Math.hypot(dx, dz)).toBeCloseTo(7 * 0.8, 12);
    // Square to the view, to its right: (forward x, z) cross gives the right as (-z, x).
    const fx = base.target[0] - base.position[0];
    const fz = base.target[2] - base.position[2];
    expect(dx * fx + dz * fz).toBeCloseTo(0, 9);
    expect(dx * -fz + dz * fx).toBeGreaterThan(0);
  });

  it("primes with the zone, eases out on leaving it and never applies on another class", () => {
    const s = createOrbitState();
    primeZone(s, zone, "mobile");
    expect(s.lookRight).toBe(2);
    updateZone(s, null, false, "mobile");
    settle(s);
    expect(s.lookRight).toBe(0);
    primeZone(s, zone, "desktop");
    expect(s.lookRight).toBe(0);
  });
});
