import { describe, expect, it, vi } from "vitest";
import { BEAM, BEACON, beaconGain, beaconInstances, beaconOrigin, beamInstance, beamSince, putInstance, type BeaconInstance, type BeamClock } from "@/experience/floors/lobby/office/beacon";
import { COLORS, LOBBY } from "@/experience/config";
import { OFFICE } from "@/experience/floors/lobby/officeLayout";
import { OFFICE_SLOTS } from "@/experience/floors/lobby/officeShell";
import { STATE_TONE } from "@/lib/office/model";

const make = () => Array.from({ length: BEACON.slots }, () => ({ y: 0, r: 0, h: 0, alpha: 0 }));

describe("beacon", () => {
  it("rises from the floor behind the asking Rover (past the riser's back edge on the back row), or the plaza centre when several ask", () => {
    const arc = LOBBY.officeWing.arc;
    for (const slot of [0, 2, 4, 5, 7, 9]) {
      const one = beaconOrigin([slot]);
      const s = OFFICE_SLOTS[slot];
      const back = Math.hypot(one.x - s.rover.x, one.z - s.rover.z);
      expect(back).toBeCloseTo(s.lift > 0 ? OFFICE.rover.radius + BEACON.r : 1.25, 5);
      expect(Math.hypot(one.x - arc.x, one.z - arc.z)).toBeGreaterThan(Math.hypot(s.rover.x - arc.x, s.rover.z - arc.z));
      // The riser ends at the back of its Rover's footprint: the column's base clears it whole.
      if (s.lift > 0) expect(back - BEACON.r).toBeGreaterThanOrEqual(OFFICE.rover.radius - 1e-9);
    }
    expect(beaconOrigin([0, 4])).toEqual(LOBBY.officeWing.plaza.center);
    // A seat the layout has no desk for (past ten) stands at the plaza centre, never crashes.
    expect(beaconOrigin([10])).toEqual(LOBBY.officeWing.plaza.center);
    // The frame passes one object: written in place, no allocation.
    const out = { x: 0, z: 0 };
    expect(beaconOrigin([7], out)).toBe(out);
    expect(beaconOrigin([0, 4], out)).toBe(out);
  });
  it("rings pulse up the column's lowest part and widen, then restart: flat bands well wider than the column", () => {
    const a = make();
    const b = make();
    beaconInstances(0.2, false, a);
    beaconInstances(0.6, false, b);
    expect(a[0]).toMatchObject({ h: BEACON.h, r: BEACON.r });
    expect(b[1].y).toBeGreaterThan(a[1].y);
    expect(b[1].r).toBeGreaterThan(a[1].r);
    for (const t of [0, 0.25, 0.5, 0.8, 1.1, 1.59, 3.3])
      for (const reduced of [false, true]) {
        const c = make();
        beaconInstances(t, reduced, c);
        for (const i of c.slice(1, 4)) {
          expect(i.y + i.h).toBeLessThanOrEqual(BEACON.rise + 1e-9);
          expect(i.r).toBeGreaterThanOrEqual(2 * BEACON.r);
          expect(i.h).toBeLessThan(i.r);
          expect(i.alpha).toBeGreaterThanOrEqual(0);
          expect(i.alpha).toBeLessThanOrEqual(1);
        }
      }
    // A ring fades in at the bottom (no pop) and out at the top.
    const start = make();
    beaconInstances(0, false, start);
    expect(start[1]).toMatchObject({ y: 0, alpha: 0 });
    // Three rings in flight, a third of the climb apart.
    expect([a[1].y, a[2].y, a[3].y].sort((x, y) => x - y).every((y, k, ys) => k === 0 || y - ys[k - 1] > 1)).toBe(true);
  });
  it("holds still under reduced motion", () => {
    const a = make();
    const b = make();
    beaconInstances(0.2, true, a);
    beaconInstances(5, true, b);
    expect(a).toEqual(b);
  });
  it("leaves the reserved slot (stage B's beam) as it is", () => {
    const a = make();
    a[4] = { y: 1, r: 2, h: 3, alpha: 0.5 };
    beaconInstances(0.4, false, a);
    expect(a[4]).toEqual({ y: 1, r: 2, h: 3, alpha: 0.5 });
  });
  it("hides the column at the office stop, keeping only faint bands around the asking Rover; whole elsewhere; the asking state's pink", () => {
    expect(beaconGain(false)).toEqual({ column: 1, bands: 1, reach: BEACON.rise });
    const stop = beaconGain(true);
    expect(stop.column).toBe(0);
    expect(stop.bands).toBeGreaterThan(0);
    expect(stop.bands).toBeLessThanOrEqual(0.3);
    // The bands climb no higher than the Rover's head (1.95 u), so nothing crosses the screen wall (from 1.2 u) far up.
    expect(stop.reach).toBeLessThanOrEqual(2);
    for (const reduced of [false, true])
      for (const t of [0, 0.3, 0.9, 1.5]) {
        const a = make();
        beaconInstances(t, reduced, a, stop.reach);
        for (const b of a.slice(1, 4)) {
          expect(b.y + b.h).toBeLessThanOrEqual(stop.reach + 1e-9);
          expect(b.alpha * stop.bands).toBeLessThanOrEqual(0.3);
        }
        expect(a[0].alpha * stop.column).toBe(0);
      }
    // Away from the stop the default reach is the rings' rise (the Lobby view).
    const lobby = make();
    const plain = make();
    beaconInstances(0.7, false, lobby, beaconGain(false).reach);
    beaconInstances(0.7, false, plain);
    expect(lobby).toEqual(plain);
    expect(COLORS.pink).toBe(STATE_TONE.input);
  });
});

describe("deploy beam", () => {
  it("fires once per new deploy, for 8 s of scene time from the moment it is first seen", () => {
    const clock: BeamClock = { deployAt: null, t0: 0 };
    expect(beamSince(null, 1, clock)).toBeNull();
    expect(beamSince(5_000, 10, clock)).toBe(0);
    expect(beamSince(5_000, 13, clock)).toBe(3);
    expect(beamSince(5_000, 10 + BEAM.s, clock)).toBeNull();
    expect(beamSince(null, 30, clock)).toBeNull();
    expect(beamSince(5_000, 31, clock)).toBeNull();
    expect(beamSince(9_000, 40, clock)).toBe(0);
  });

  it("rises over 0.6 s, holds, fades over the last 1.5 s; steady under reduced motion; no higher than the wall's top at the stop", () => {
    const b: BeaconInstance = { y: 0, r: 0, h: 0, alpha: 0 };
    beamInstance(0.3, false, false, b);
    expect(b.h).toBeCloseTo(BEAM.h / 2);
    beamInstance(3, false, false, b);
    expect(b).toMatchObject({ h: BEAM.h, r: BEAM.r });
    beamInstance(BEAM.s - 0.75, false, false, b);
    expect(b.alpha).toBeCloseTo(0.95 / 2);
    beamInstance(0.1, true, false, b);
    const steady = { ...b };
    beamInstance(BEAM.s - 0.1, true, false, b);
    expect(b).toEqual(steady);
    beamInstance(3, false, true, b);
    expect(b.h).toBe(BEAM.stopH);
    beamInstance(null, false, false, b);
    expect(b).toEqual({ y: 0, r: 0, h: 0, alpha: 0 });
  });

  it("uses the reserved slot, and stops at the wall's top (6.6 u) at the office stop", () => {
    expect(BEAM.slot).toBe(BEACON.slots - 1);
    expect(BEAM.stopH).toBeCloseTo(OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame);
    expect(BEAM.stopH).toBeCloseTo(6.6);
  });
});

describe("beacon frame writes", () => {
  it("write the instances in place: no Object.assign or fresh object per frame", () => {
    const out = Array.from({ length: BEACON.slots }, (): BeaconInstance => ({ y: 0, r: 0, h: 0, alpha: 0 }));
    const assign = vi.spyOn(Object, "assign");
    try {
      beaconInstances(1.3, false, out);
      beaconInstances(1.3, true, out, 2);
      beamInstance(null, false, false, out[BEAM.slot]);
      beamInstance(2, false, true, out[BEAM.slot]);
      putInstance(out[1], 0, 0, 0, 0);
      expect(assign).not.toHaveBeenCalled();
    } finally {
      assign.mockRestore();
    }
    expect(out[1]).toEqual({ y: 0, r: 0, h: 0, alpha: 0 });
    expect(out[BEAM.slot]).toEqual({ y: 0, r: BEAM.r, h: BEAM.stopH, alpha: 0.95 });
  });
});
