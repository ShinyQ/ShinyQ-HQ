import { describe, expect, it } from "vitest";
import { BEACON, beaconGain, beaconInstances, beaconOrigin } from "@/experience/floors/lobby/office/beacon";
import { COLORS, LOBBY } from "@/experience/config";
import { OFFICE_SLOTS } from "@/experience/floors/lobby/officeShell";
import { STATE_TONE } from "@/lib/office/model";

const make = () => Array.from({ length: BEACON.slots }, () => ({ y: 0, r: 0, h: 0, alpha: 0 }));

describe("beacon", () => {
  it("rises behind the asking Rover, or the plaza centre when several ask", () => {
    const one = beaconOrigin([2]);
    const arc = LOBBY.officeWing.arc;
    const r = OFFICE_SLOTS[2].rover;
    expect(Math.hypot(one.x - r.x, one.z - r.z)).toBeCloseTo(1.25, 5);
    expect(Math.hypot(one.x - arc.x, one.z - arc.z)).toBeGreaterThan(Math.hypot(r.x - arc.x, r.z - arc.z));
    expect(beaconOrigin([0, 4])).toEqual(LOBBY.officeWing.plaza.center);
  });
  it("bands climb the column and widen, then restart", () => {
    const a = make();
    const b = make();
    beaconInstances(0.2, false, a);
    beaconInstances(0.6, false, b);
    expect(a[0]).toMatchObject({ h: BEACON.h, r: BEACON.r });
    expect(b[1].y).toBeGreaterThan(a[1].y);
    expect(b[1].r).toBeGreaterThan(a[1].r);
    for (const i of a.slice(1, 4)) expect(i.y).toBeLessThanOrEqual(BEACON.h);
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
    expect(beaconGain(false)).toEqual({ column: 1, bands: 1, reach: BEACON.h });
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
    // Away from the stop the default reach is the column's height (the Lobby view is unchanged).
    const lobby = make();
    const plain = make();
    beaconInstances(0.7, false, lobby, beaconGain(false).reach);
    beaconInstances(0.7, false, plain);
    expect(lobby).toEqual(plain);
    expect(COLORS.pink).toBe(STATE_TONE.input);
  });
});
