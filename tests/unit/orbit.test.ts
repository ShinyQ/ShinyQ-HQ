import { describe, expect, it } from "vitest";
import {
  createOrbitState,
  nearestAngle,
  PITCH_RANGE,
  RAIL_MAX_YAW,
  resetView,
  rotate,
  rotateStep,
  ROTATE_STEP,
  stepOrbit,
  updateZone,
  VIEW_ZONES,
  zoneAt,
  zoomBy,
  ZOOM_RANGE,
} from "@/experience/camera/orbit";

const settle = (s: ReturnType<typeof createOrbitState>, reduced = false) => {
  for (let i = 0; i < 240; i++) stepOrbit(s, 1 / 60, reduced);
};

describe("free orbit", () => {
  it("rotates without a yaw limit and keeps the view (no spring back)", () => {
    const s = createOrbitState();
    for (let i = 0; i < 10; i++) rotate(s, 1);
    expect(s.yaw).toBeCloseTo(10);
    settle(s);
    expect(s.yaw).toBeCloseTo(10);
  });

  it("clamps pitch and zoom", () => {
    const s = createOrbitState();
    rotate(s, 0, 10);
    expect(s.pitch).toBe(PITCH_RANGE[1]);
    rotate(s, 0, -10);
    expect(s.pitch).toBe(PITCH_RANGE[0]);
    zoomBy(s, 10);
    expect(s.zoom).toBe(ZOOM_RANGE[1]);
    zoomBy(s, 0.01);
    expect(s.zoom).toBe(ZOOM_RANGE[0]);
  });

  it("eases button steps and accumulates quick presses", () => {
    const s = createOrbitState();
    rotateStep(s, 1);
    rotateStep(s, 1);
    expect(s.yaw).toBe(0);
    settle(s);
    expect(s.yaw).toBeCloseTo(2 * ROTATE_STEP);
  });

  it("resets to the nearest full turn, pitch and zoom", () => {
    const s = createOrbitState();
    rotate(s, 2 * Math.PI + 0.5, 0.3);
    zoomBy(s, 1.3);
    resetView(s);
    settle(s);
    expect(s.yaw).toBeCloseTo(2 * Math.PI);
    expect(s.pitch).toBeCloseTo(0);
    expect(s.zoom).toBeCloseTo(1);
  });

  it("snaps instead of easing under reduced motion", () => {
    const s = createOrbitState();
    rotateStep(s, -1);
    stepOrbit(s, 1 / 60, true);
    expect(s.yaw).toBeCloseTo(-ROTATE_STEP);
    expect(s.easing).toBe(false);
  });

  it("limits the rail camera yaw", () => {
    const s = createOrbitState();
    rotate(s, 5, 0, true);
    expect(s.railYaw).toBe(RAIL_MAX_YAW);
    expect(s.yaw).toBe(0);
    rotateStep(s, -1, true);
    settle(s);
    expect(s.railYaw).toBeCloseTo(RAIL_MAX_YAW - ROTATE_STEP);
  });

  it("picks the nearest equivalent angle", () => {
    expect(nearestAngle(-Math.PI / 2, 2 * Math.PI)).toBeCloseTo(1.5 * Math.PI);
    expect(nearestAngle(0, 0.1)).toBeCloseTo(0);
  });
});

describe("wall auto-face", () => {
  const cert = VIEW_ZONES.L1!.find((z) => z.id === "L1:certifications")!;
  const inside = { x: (cert.area.minX + cert.area.maxX) / 2, z: (cert.area.minZ + cert.area.maxZ) / 2 };

  it("finds Lobby zones", () => {
    expect(zoneAt("L1", inside)?.id).toBe("L1:certifications");
    expect(zoneAt("L1", { x: 0, z: 6 })).toBeNull();
    expect(zoneAt("L4", inside)).toBeNull();
  });

  it("eases to face the wall when the rover walks in", () => {
    const s = createOrbitState();
    updateZone(s, cert, false);
    settle(s);
    expect(s.yaw).toBeCloseTo(cert.yaw);
  });

  it("is cancelled by user rotation until the rover leaves", () => {
    const s = createOrbitState();
    updateZone(s, cert, false);
    rotate(s, 0.4);
    settle(s);
    expect(s.yaw).toBeCloseTo(0.4);
    updateZone(s, cert, false);
    settle(s);
    expect(s.yaw).toBeCloseTo(0.4);
    updateZone(s, null, false);
    updateZone(s, cert, false);
    settle(s);
    expect(s.yaw).toBeCloseTo(cert.yaw);
  });

  it("stays off under reduced motion", () => {
    const s = createOrbitState();
    updateZone(s, cert, true);
    settle(s, true);
    expect(s.yaw).toBe(0);
  });
});
