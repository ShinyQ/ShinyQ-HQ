import { beforeEach, describe, expect, it } from "vitest";
import { advanceBeam, startBeam, type Beam } from "@/experience/nav/teleport";
import { advanceRide, type Ride } from "@/experience/tower/elevator";
import { beamNow, clearBeam, clearRide, keepBeam, keepRide, rideNow } from "@/experience/tower/rideClock";

const DT = 1 / 60;

beforeEach(() => {
  clearRide();
  clearBeam();
});

describe("ride clock", () => {
  it("drives a whole ride with one store write per stage and the same progress as per-frame writes", () => {
    let stored: Ride | null = { from: "L1", to: "L2", stage: "toDoor", t: 0 };
    let perFrame: Ride | null = stored;
    let writes = 0;
    for (let frame = 0; frame < 600 && stored; frame++) {
      const atDoor = frame > 2;
      const ride = rideNow(stored);
      expect(ride).toEqual(perFrame);
      const next = advanceRide(ride, DT, { atDoor, reduced: false });
      perFrame = perFrame && advanceRide(perFrame, DT, { atDoor, reduced: false });
      if (next && next.stage === ride.stage) keepRide(stored, next);
      else {
        clearRide();
        stored = next;
        writes += 1;
      }
    }
    expect(stored).toBeNull();
    expect(writes).toBe(6);
  });

  it("starts a new store object (retarget, cancel, a new ride) from its own t", () => {
    const stored: Ride = { from: "L1", to: "L2", stage: "moving", t: 0 };
    keepRide(stored, { ...stored, t: 0.4 });
    expect(rideNow(stored).t).toBe(0.4);
    const retargeted: Ride = { ...stored, to: "L3" };
    expect(rideNow(retargeted)).toBe(retargeted);
    clearRide();
    expect(rideNow(stored)).toBe(stored);
  });
});

describe("beam clock", () => {
  it("writes the store when the rover jumps and when the beam ends", () => {
    let stored: Beam | null = startBeam({ x: 0, z: 0 }, { id: "teleport:2021", kind: "teleport", at: { x: 40, z: 6 }, year: 2021, face: 0 });
    let writes = 0;
    let jumps = 0;
    for (let frame = 0; frame < 120 && stored; frame++) {
      const beam = beamNow(stored);
      const step = advanceBeam(beam, DT, false);
      if (step.jump) jumps += 1;
      if (step.beam && !step.jump) keepBeam(stored, step.beam);
      else {
        clearBeam();
        stored = step.beam;
        writes += 1;
      }
    }
    expect(stored).toBeNull();
    expect(jumps).toBe(1);
    expect(writes).toBe(2);
  });
});
