import { describe, expect, it } from "vitest";
import { createOrbitState, primeZone, rotate, updateZone, yawLooking, zoneView, type ViewZone } from "@/experience/camera/orbit";
import { FOLLOW, orbitOffset } from "@/experience/camera/rigs";

const unit = (x: number, z: number) => {
  const l = Math.hypot(x, z);
  return { x: x / l, z: z / l };
};

describe("yawLooking", () => {
  it("is 0 for the default north-west look and -PI/4 for north", () => {
    expect(yawLooking({ x: -1, z: -1 })).toBeCloseTo(0);
    expect(yawLooking({ x: 0, z: -1 })).toBeCloseTo(-Math.PI / 4);
  });

  it("puts the follow camera behind the rover, looking along the direction", () => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const d = { x: Math.cos(a), z: Math.sin(a) };
      for (const cls of ["desktop", "mobile"] as const) {
        const [ox, , oz] = orbitOffset(FOLLOW[cls].offset, yawLooking(d), 0);
        const o = unit(ox, oz);
        expect(o.x).toBeCloseTo(-d.x);
        expect(o.z).toBeCloseTo(-d.z);
      }
    }
  });
});

describe("primeZone", () => {
  const zone: ViewZone = { id: "L1:kiosk", area: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, yaw: 1.2, zoom: 1.3 };

  it("applies the zone at once, without easing", () => {
    const s = createOrbitState();
    primeZone(s, zone);
    expect(s).toMatchObject({ zone: "L1:kiosk", yaw: 1.2, yawTarget: 1.2, zoom: 1.3, zoomTarget: 1.3, zoneZoom: 1.3, easing: false });
  });

  it("leaves nothing for updateZone to do in the same zone", () => {
    const s = createOrbitState();
    primeZone(s, zone);
    const before = { ...s };
    updateZone(s, zone, false);
    expect(s).toEqual(before);
  });

  it("keeps the default view without a zone", () => {
    const s = createOrbitState();
    primeZone(s, null);
    expect(s).toMatchObject({ zone: null, yaw: 0, zoom: 1, easing: false });
  });
});

describe("per camera class views", () => {
  const zone: ViewZone = { id: "L1:kiosk", area: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, yaw: 2, zoom: 1.5, classView: { mobile: { yaw: 1.4, zoom: 1.75 } } };

  it("uses the class view where one is set, the zone's own elsewhere", () => {
    expect(zoneView(zone, "mobile")).toEqual({ yaw: 1.4, zoom: 1.75 });
    expect(zoneView(zone, "desktop")).toEqual({ yaw: 2, zoom: 1.5 });
    expect(zoneView({ ...zone, zoom: undefined, classView: undefined }, "tablet")).toEqual({ yaw: 2, zoom: undefined });
  });

  it("primes and eases to the class view", () => {
    const a = createOrbitState();
    primeZone(a, zone, "mobile");
    expect(a).toMatchObject({ yaw: 1.4, zoom: 1.75 });
    const b = createOrbitState();
    updateZone(b, zone, false, "mobile");
    expect(b).toMatchObject({ yawTarget: 1.4, zoomTarget: 1.75, easing: true });
    const c = createOrbitState();
    updateZone(c, zone, false);
    expect(c).toMatchObject({ yawTarget: 2, zoomTarget: 1.5, zoneTurn: null });
  });

  // The B1 phone arrival (owner 2026-10-18): a class view may turn and pitch the camera off the zone's own view, and the
  // camera eases back to the zone's yaw with a level pitch when the rover leaves, unless the visitor turned by hand.
  const turned: ViewZone = { ...zone, classView: { mobile: { yaw: 1.4, zoom: 1.75, pitch: -0.3 } } };

  it("applies a class pitch and eases the turn back to the zone's own yaw on exit", () => {
    expect(zoneView(turned, "mobile")).toEqual({ yaw: 1.4, zoom: 1.75, pitch: -0.3 });
    const a = createOrbitState();
    primeZone(a, turned, "mobile");
    expect(a).toMatchObject({ yaw: 1.4, pitch: -0.3, pitchTarget: -0.3, zoneTurn: 2 });
    updateZone(a, null, false, "mobile");
    expect(a).toMatchObject({ yawTarget: 2, pitchTarget: 0, zoomTarget: 1, zoneTurn: null, easing: true });
    const b = createOrbitState();
    updateZone(b, turned, false, "mobile");
    expect(b).toMatchObject({ yawTarget: 1.4, pitchTarget: -0.3, zoneTurn: 2 });
    const d = createOrbitState();
    primeZone(d, turned, "desktop");
    expect(d).toMatchObject({ yaw: 2, pitch: 0, zoneTurn: null });
  });

  it("keeps a hand turn when the rover leaves a turned class view", () => {
    const s = createOrbitState();
    primeZone(s, turned, "mobile");
    rotate(s, 0.5);
    updateZone(s, null, false, "mobile");
    expect(s.yawTarget).toBeCloseTo(1.9);
    expect(s.zoneTurn).toBeNull();
  });
});
