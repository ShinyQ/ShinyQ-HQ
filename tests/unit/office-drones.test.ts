import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { LOBBY } from "@/experience/config";
import { officeSlots } from "@/experience/floors/lobby/officeLayout";
import { crewFx, DRONES, dronePoint, newActor, type FxPoint } from "@/experience/floors/lobby/office/crew";
import { CREW_GLOW, droneKey, TOWER, writeCrewGlow } from "@/experience/floors/lobby/office/crewFx";
import { DRONE_PART, GLOW_PER_ROVER, PARTS_PER_ROVER, roverFrame, TREADS_PER_ROVER, writeDrones, writeRover } from "@/experience/floors/lobby/office/officeRig";
import { stillPose } from "@/experience/floors/lobby/office/officeVisual";

const slots = officeSlots(LOBBY.officeWing);
const pt = (): FxPoint => ({ x: 0, y: 0, z: 0, a: 0 });
const scaleAt = (a: Float32Array, i: number) => new Vector3().setFromMatrixScale(new Matrix4().fromArray(a, i * 16)).x;
const angle = (p: FxPoint) => Math.atan2(p.z, p.x);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe("helper drones", () => {
  it("keeps every drone at the orbit radius from the head axis, evenly spaced, for 1 to 4 helpers", () => {
    for (const reduced of [false, true]) {
      for (let n = 1; n <= 4; n++) {
        const ps = Array.from({ length: n }, (_, i) => dronePoint(i, n, 2.3, 0.7, reduced, pt()));
        for (const p of ps) {
          expect(Math.hypot(p.x, p.z)).toBeCloseTo(DRONES.r, 6);
          expect(Math.abs(p.y - DRONES.y)).toBeLessThanOrEqual(DRONES.bob + 1e-9);
          expect(p.a).toBe(1);
        }
        for (let i = 1; i < n; i++) expect(wrap(angle(ps[i]) - angle(ps[i - 1]))).toBeCloseTo(wrap((2 * Math.PI) / n), 6);
      }
    }
  });

  it("hides drones past the count (at most 4 drawn)", () => {
    expect(dronePoint(2, 2, 0, 0, false, pt()).a).toBe(0);
    expect(dronePoint(3, 9, 0, 0, false, pt()).a).toBe(1);
    expect(dronePoint(0, 0, 0, 0, false, pt()).a).toBe(0);
  });

  it("orbits in full motion and parks under reduced motion", () => {
    const a = dronePoint(1, 3, 0.5, 0.2, false, pt());
    const b = dronePoint(1, 3, 1.5, 0.2, false, pt());
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(0.1);
    expect(dronePoint(1, 3, 0.5, 0.2, true, pt())).toEqual(dronePoint(1, 3, 99, 0.2, true, pt()));
  });

  it("writes min(n, 4) drone bodies in the parts mesh and zero scale for the rest", () => {
    expect(PARTS_PER_ROVER).toBe(10);
    expect(DRONE_PART).toBe(6);
    const frame = roverFrame(slots[1], stillPose("working"), new Matrix4());
    for (const n of [0, 1, 3, 4, 6]) {
      const parts = new Float32Array(2 * PARTS_PER_ROVER * 16);
      writeDrones(frame, n, 1.2, 0.4, false, parts, PARTS_PER_ROVER);
      const drawn = Array.from({ length: DRONES.max }, (_, i) => scaleAt(parts, PARTS_PER_ROVER + DRONE_PART + i));
      expect(drawn.filter((s) => s > 0)).toHaveLength(Math.min(n, DRONES.max));
      for (let i = 0; i < DRONES.max; i++) expect(drawn[i] > 0).toBe(i < Math.min(n, DRONES.max));
      // Nothing outside the Rover's four drone parts is touched.
      for (let k = 0; k < (PARTS_PER_ROVER + DRONE_PART) * 16; k++) expect(parts[k]).toBe(0);
    }
  });

  it("writeRover writes zero-scale drones by default (the rest instances) and the bodies when given helpers", () => {
    const parts = new Float32Array(PARTS_PER_ROVER * 16);
    const treads = new Float32Array(TREADS_PER_ROVER * 16);
    const p = stillPose("working");
    const frame = roverFrame(slots[0], p, new Matrix4());
    writeRover(frame, p, parts, 0, treads);
    for (let i = 0; i < DRONES.max; i++) expect(scaleAt(parts, DRONE_PART + i)).toBe(0);
    writeRover(frame, p, parts, 0, treads, 2, 0, 0, true);
    expect([0, 1, 2, 3].map((i) => scaleAt(parts, DRONE_PART + i) > 0)).toEqual([true, true, false, false]);
  });

  it("lights one eye per drawn drone on the full tier and none on the lite tier", () => {
    expect(CREW_GLOW.eyes).toBe(16);
    expect(CREW_GLOW.count).toBe(20);
    expect(GLOW_PER_ROVER).toBe(38);
    expect(TOWER.start).toBe(5 * GLOW_PER_ROVER);
    const fx = crewFx(newActor("working"), false);
    const frame = roverFrame(slots[2], stillPose("working"), new Matrix4());
    const base = 2 * GLOW_PER_ROVER + 18 + CREW_GLOW.eyes;
    const eyes = (lite: boolean, n: number) => {
      const m = new Float32Array(5 * GLOW_PER_ROVER * 16);
      const c = new Float32Array(5 * GLOW_PER_ROVER * 3);
      writeCrewGlow(slots[2], frame, "working", fx, 1, 0.3, false, m, c, n, lite);
      return Array.from({ length: DRONES.max }, (_, i) => scaleAt(m, base + i));
    };
    expect(eyes(false, 3).map((s) => s > 0)).toEqual([true, true, true, false]);
    expect(eyes(false, 0).every((s) => s === 0)).toBe(true);
    expect(eyes(true, 4).every((s) => s === 0)).toBe(true);
  });

  it("keys the drones: empty without drones, stable under reduced motion, a 30 Hz tick in full motion", () => {
    expect(droneKey(0, 1, false, false)).toBe("");
    expect(droneKey(3, 1, true, false)).toBe(droneKey(3, 50, true, false));
    expect(droneKey(3, 1, true, false)).not.toBe(droneKey(2, 1, true, false));
    expect(droneKey(6, 1, true, false)).toBe(droneKey(4, 1, true, false));
    expect(droneKey(3, 1, true, false)).not.toBe(droneKey(3, 1, true, true));
    expect(droneKey(3, 0, false, false)).not.toBe(droneKey(3, 1 / 30 + 1e-6, false, false));
    expect(droneKey(3, 0, false, false)).toBe(droneKey(3, 1 / 60, false, false));
  });
});
