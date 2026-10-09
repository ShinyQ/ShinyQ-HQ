import { describe, expect, it } from "vitest";
import {
  advanceRide,
  carY,
  dollyDuration,
  doorsOpen,
  easeInOutCubic,
  REDUCED_CUT,
  rideDirection,
  type Ride,
} from "@/experience/tower/elevator";

const ride = (over: Partial<Ride> = {}): Ride => ({ from: "L1", to: "L2", stage: "toDoor", t: 0, ...over });

function run(start: Ride, reduced: boolean, dt = 0.05) {
  const stages: string[] = [];
  let current: Ride | null = start;
  let elapsed = 0;
  while (current && elapsed < 10) {
    if (stages.at(-1) !== current.stage) stages.push(current.stage);
    current = advanceRide(current, dt, { atDoor: true, reduced });
    elapsed += dt;
  }
  return { stages, elapsed };
}

describe("elevator ride", () => {
  it("waits in toDoor until the rover reaches the door", () => {
    const next = advanceRide(ride(), 0.5, { atDoor: false, reduced: false });
    expect(next).toMatchObject({ stage: "toDoor", t: 0.5 });
  });

  it("runs every stage in order and then finishes", () => {
    const { stages, elapsed } = run(ride(), false);
    expect(stages).toEqual(["toDoor", "boarding", "closing", "moving", "opening", "exiting"]);
    expect(elapsed).toBeGreaterThan(2);
    expect(elapsed).toBeLessThan(2.4);
  });

  it("collapses to a short cut under reduced motion", () => {
    const { stages, elapsed } = run(ride(), true, 0.01);
    expect(stages).toEqual(["toDoor", "moving"]);
    expect(elapsed).toBeLessThan(REDUCED_CUT + 0.05);
  });

  it("dollies for 0.8 s per single floor", () => {
    expect(dollyDuration("L1", "L2")).toBeCloseTo(0.8);
    expect(dollyDuration("RF", "L4")).toBeCloseTo(0.8);
    expect(dollyDuration("L1", "RF")).toBeGreaterThan(0.8);
  });

  it("eases the car between floor heights", () => {
    const moving = ride({ stage: "moving", t: 0.4 });
    expect(carY(ride({ stage: "closing" }), false)).toBe(0);
    expect(carY(moving, false)).toBeCloseTo(7);
    expect(carY(ride({ stage: "moving", t: 0.1 }), false)).toBeLessThan(7 * 0.2);
    expect(carY(ride({ stage: "exiting" }), false)).toBe(14);
    expect(carY(ride({ stage: "moving", t: 0.1 }), true)).toBe(14);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("opens the right doors", () => {
    expect(doorsOpen(ride({ stage: "boarding" }), "L1", false)).toBe(1);
    expect(doorsOpen(ride({ stage: "boarding" }), "L2", false)).toBe(0);
    expect(doorsOpen(ride({ stage: "exiting" }), "L2", false)).toBe(1);
    expect(doorsOpen(null, "L1", false)).toBe(0);
  });

  it("reports the direction", () => {
    expect(rideDirection(ride())).toBe("up");
    expect(rideDirection(ride({ from: "RF", to: "L3" }))).toBe("down");
  });
});
