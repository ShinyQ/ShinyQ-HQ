import { describe, expect, it } from "vitest";
import { FIRST_PERSON } from "@/experience/camera/firstPerson";
import {
  createOrbitState,
  nearestAngle,
  resetView,
  rotate,
  rotateStep,
  ROTATE_STEP,
  setPitchRange,
  stepOrbit,
  updateZone,
  VIEW_ZONES,
  zoneAt,
  zoomBy,
  ZOOM_RANGE,
  type OrbitState,
} from "@/experience/camera/orbit";
import { pitchRange } from "@/experience/camera/rigs";

const settle = (s: OrbitState, reduced = false) => {
  for (let i = 0; i < 240; i++) stepOrbit(s, 1 / 60, reduced);
};
/** Zooms to the closest third-person distance without entering first person. */
const toClosest = (s: OrbitState) => {
  while (s.zoom > ZOOM_RANGE[0]) zoomBy(s, 0.9, false);
};
/** Closest distance, then one strong zoom-in step past it: first person. */
const intoFirstPerson = (s: OrbitState) => {
  toClosest(s);
  zoomBy(s, 0.5);
};

const cert = VIEW_ZONES.L1!.find((z) => z.id === "L1:certifications")!;

describe("free orbit", () => {
  it("rotates without a yaw limit and keeps the view (no spring back)", () => {
    const s = createOrbitState();
    for (let i = 0; i < 10; i++) rotate(s, 1);
    expect(s.yaw).toBeCloseTo(10);
    settle(s);
    expect(s.yaw).toBeCloseTo(10);
  });

  it("clamps the pitch to the active rig's range and the zoom to ZOOM_RANGE", () => {
    const s = createOrbitState();
    const [lo, hi] = pitchRange("desktop", "follow");
    rotate(s, 0, 10);
    expect(s.pitch).toBe(hi);
    rotate(s, 0, -10);
    expect(s.pitch).toBe(lo);
    rotate(s, 0, 10);
    setPitchRange(s, pitchRange("mobile", "follow"));
    expect(s.pitch).toBe(pitchRange("mobile", "follow")[1]);
    zoomBy(s, 10);
    expect(s.zoom).toBe(ZOOM_RANGE[1]);
    zoomBy(s, 0.01, false);
    expect(s.zoom).toBe(ZOOM_RANGE[0]);
    expect(s.firstPerson).toBe(false);
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

  it("turns the L2 camera all the way around too, on its own yaw", () => {
    const s = createOrbitState();
    rotate(s, 5, 0, true);
    expect(s.railYaw).toBe(5);
    expect(s.yaw).toBe(0);
    rotateStep(s, 1, true);
    settle(s);
    expect(s.railYaw).toBeCloseTo(5 + ROTATE_STEP);
    resetView(s);
    settle(s);
    expect(Math.abs(Math.sin(s.railYaw / 2))).toBeLessThan(1e-6);
  });

  it("picks the nearest equivalent angle", () => {
    expect(nearestAngle(-Math.PI / 2, 2 * Math.PI)).toBeCloseTo(1.5 * Math.PI);
    expect(nearestAngle(0, 0.1)).toBeCloseTo(0);
  });
});

describe("first person", () => {
  it("enters only after zooming in past the closest third-person distance", () => {
    const s = createOrbitState();
    toClosest(s);
    expect(s.firstPerson).toBe(false);
    zoomBy(s, 0.9);
    expect(s.firstPerson).toBe(false);
    zoomBy(s, 0.9);
    expect(s.firstPerson).toBe(true);
    expect(s.look).toBe(FIRST_PERSON.look);
    expect(s.zoom).toBe(ZOOM_RANGE[0]);
  });

  it("forgets a push after a pause between zoom inputs", () => {
    const s = createOrbitState();
    toClosest(s);
    zoomBy(s, 0.9);
    stepOrbit(s, FIRST_PERSON.pushIdle + 0.1, false);
    zoomBy(s, 0.9);
    expect(s.firstPerson).toBe(false);
  });

  it("does not enter while the view is held in third person", () => {
    const s = createOrbitState();
    toClosest(s);
    zoomBy(s, 0.5, false);
    expect(s.firstPerson).toBe(false);
  });

  it("returns to third person at the closest distance when zooming out", () => {
    const s = createOrbitState();
    intoFirstPerson(s);
    expect(s.firstPerson).toBe(true);
    zoomBy(s, 1.1);
    expect(s.firstPerson).toBe(true);
    zoomBy(s, 1.1);
    expect(s.firstPerson).toBe(false);
    expect(s.zoom).toBe(ZOOM_RANGE[0]);
  });

  it("looks around with the pitch limited and leaves the third-person tilt alone", () => {
    const s = createOrbitState();
    intoFirstPerson(s);
    const pitch = s.pitch;
    rotate(s, 0.3, 10);
    expect(s.look).toBe(FIRST_PERSON.pitch[0]);
    rotate(s, 0, -10);
    expect(s.look).toBe(FIRST_PERSON.pitch[1]);
    expect(s.pitch).toBe(pitch);
    expect(s.yaw).toBeCloseTo(0.3);
  });

  it("glides in over FIRST_PERSON.glide and cuts under reduced motion", () => {
    const s = createOrbitState();
    intoFirstPerson(s);
    stepOrbit(s, FIRST_PERSON.glide / 2, false);
    expect(s.blend).toBeCloseTo(0.5);
    stepOrbit(s, FIRST_PERSON.glide, false);
    expect(s.blend).toBe(1);
    zoomBy(s, 2);
    stepOrbit(s, 1 / 60, true);
    expect(s.blend).toBe(0);
  });

  it("pulls back while held and comes back afterwards", () => {
    const s = createOrbitState();
    intoFirstPerson(s);
    stepOrbit(s, 1, false);
    expect(s.blend).toBe(1);
    stepOrbit(s, 1, false, true);
    expect(s.blend).toBe(0);
    expect(s.firstPerson).toBe(true);
    stepOrbit(s, 1, false);
    expect(s.blend).toBe(1);
  });

  it("leaves first person on reset", () => {
    const s = createOrbitState();
    intoFirstPerson(s);
    resetView(s);
    expect(s.firstPerson).toBe(false);
    settle(s);
    expect(s.zoom).toBeCloseTo(1);
    expect(s.blend).toBe(0);
  });

  it("does not auto-face walls in first person", () => {
    const s = createOrbitState();
    intoFirstPerson(s);
    updateZone(s, cert, false);
    settle(s);
    expect(s.yaw).toBe(0);
  });
});

describe("wall auto-face", () => {
  const inside = { x: (cert.area.minX + cert.area.maxX) / 2, z: (cert.area.minZ + cert.area.maxZ) / 2 };

  it("finds Lobby zones", () => {
    expect(zoneAt("L1", inside)?.id).toBe("L1:certifications");
    expect(zoneAt("L1", { x: 14, z: 6 })).toBeNull();
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

  it("zooms out for a wide wall and restores the zoom on exit", () => {
    const skills = VIEW_ZONES.L1!.find((z) => z.id === "L1:skills")!;
    const s = createOrbitState();
    updateZone(s, skills, false);
    settle(s);
    expect(s.zoom).toBeCloseTo(skills.zoom!);
    updateZone(s, null, false);
    settle(s);
    expect(s.zoom).toBeCloseTo(1);
  });

  it("keeps a manual zoom when leaving a zone", () => {
    const skills = VIEW_ZONES.L1!.find((z) => z.id === "L1:skills")!;
    const s = createOrbitState();
    updateZone(s, skills, false);
    settle(s);
    zoomBy(s, 0.8);
    const manual = s.zoom;
    updateZone(s, null, false);
    settle(s);
    expect(s.zoom).toBeCloseTo(manual);
  });

  it("stays off under reduced motion", () => {
    const s = createOrbitState();
    updateZone(s, cert, true);
    settle(s, true);
    expect(s.yaw).toBe(0);
  });
});
