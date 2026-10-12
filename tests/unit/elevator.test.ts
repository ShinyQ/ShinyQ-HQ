import { describe, expect, it } from "vitest";
import {
  advanceRide,
  carY,
  dollyDuration,
  doorsOpen,
  easeInOutCubic,
  PREPARE_TIMEOUT,
  REDUCED_CUT,
  RIDE_CAP,
  rideCap,
  rideDirection,
  STAGE_TIME,
  trackFrameDt,
  TYPICAL_FRAME_DT,
  type Ride,
} from "@/experience/tower/elevator";

const ride = (over: Partial<Ride> = {}): Ride => ({ from: "L1", to: "L2", stage: "toDoor", t: 0, ...over });

function run(start: Ride, reduced: boolean, dt = 1 / 60) {
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
  it("pauses the dolly on long frames instead of skipping it (owner report, Windows PC)", () => {
    let r: Ride | null = ride({ stage: "moving", t: 0 });
    const ys: number[] = [];
    let frames = 0;
    while (r?.stage === "moving" && frames < 200) {
      ys.push(carY(r, false));
      r = advanceRide(r, 0.25, { atDoor: true, reduced: false });
      frames += 1;
    }
    // 0.8 s of dolly at no more than 1/30 s of ride time per frame.
    expect(frames).toBeGreaterThanOrEqual(24);
    expect(new Set(ys.map((y) => y.toFixed(3))).size).toBeGreaterThanOrEqual(12);
    const steps = ys.slice(1).map((y, i) => Math.abs(y - ys[i]));
    expect(Math.max(...steps)).toBeLessThanOrEqual(0.25 * 14);
  });

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

describe("ride clock", () => {
  it("lets one frame add at most 1/30 s at 60 fps", () => {
    expect(rideCap(TYPICAL_FRAME_DT)).toBeCloseTo(1 / 30);
  });

  it("keeps steadily slow devices in real time up to 20 fps", () => {
    let typical = TYPICAL_FRAME_DT;
    for (let i = 0; i < 100; i++) typical = trackFrameDt(typical, 1 / 20);
    expect(rideCap(typical)).toBeCloseTo(RIDE_CAP.max);
    typical = TYPICAL_FRAME_DT;
    for (let i = 0; i < 100; i++) typical = trackFrameDt(typical, 1 / 30);
    expect(rideCap(typical)).toBeGreaterThanOrEqual(1 / 30);
  });

  it("is not fooled by a few stalls", () => {
    let typical = TYPICAL_FRAME_DT;
    for (let i = 0; i < 60; i++) typical = trackFrameDt(typical, i % 20 === 0 ? 0.25 : 1 / 60);
    expect(rideCap(typical)).toBeLessThan(RIDE_CAP.max);
    expect(rideCap(0.2)).toBe(RIDE_CAP.max);
    expect(trackFrameDt(TYPICAL_FRAME_DT, 5)).toBeLessThanOrEqual(TYPICAL_FRAME_DT + RIDE_CAP.max * 0.1);
  });

  it("uses the frame time in toDoor, where the rover drives in real time", () => {
    expect(advanceRide(ride(), 0.5, { atDoor: false, reduced: false })).toMatchObject({ stage: "toDoor", t: 0.5 });
  });

  it("honours an explicit cap", () => {
    const next = advanceRide(ride({ stage: "moving", t: 0 }), 0.25, { atDoor: true, reduced: false, cap: RIDE_CAP.max });
    expect(next?.t).toBeCloseTo(RIDE_CAP.max);
  });
});

describe("destination gate", () => {
  const closing = ride({ stage: "closing", t: STAGE_TIME.closing - 0.01 });
  const opts = (ready: boolean) => ({ atDoor: true, reduced: false, ready });

  it("holds the car at closed doors until the destination is ready", () => {
    let r = advanceRide(closing, 0.02, opts(false))!;
    expect(r).toMatchObject({ stage: "closing", t: STAGE_TIME.closing });
    expect(r.held).toBeCloseTo(0.02);
    expect(doorsOpen(r, "L1", false)).toBe(0);
    expect(carY(r, false)).toBe(0);
    r = advanceRide(r, 0.02, opts(false))!;
    expect(r.held).toBeCloseTo(0.04);
    r = advanceRide(r, 0.02, opts(true))!;
    expect(r).toMatchObject({ stage: "moving", t: 0 });
    expect(r.held).toBeCloseTo(0.04);
  });

  it("gives up after PREPARE_TIMEOUT of real frame time", () => {
    let r: Ride | null = closing;
    let frames = 0;
    while (r?.stage === "closing" && frames < 100) {
      r = advanceRide(r, 0.25, opts(false));
      frames += 1;
    }
    expect(r?.stage).toBe("moving");
    expect(r?.held).toBeGreaterThanOrEqual(PREPARE_TIMEOUT - 1e-9);
    // 0.25 s frames: six frames of waiting, then the car moves (the wait is not capped like ride time).
    expect(frames).toBeLessThanOrEqual(8);
  });

  it("holds reduced motion at the door, before the cut", () => {
    let r = advanceRide(ride(), 0.02, { atDoor: true, reduced: true, ready: false })!;
    expect(r.stage).toBe("toDoor");
    expect(r.held).toBeCloseTo(0.02);
    r = advanceRide(r, 0.02, { atDoor: true, reduced: true, ready: true })!;
    expect(r.stage).toBe("moving");
  });

  it("never holds when the destination is ready (the default)", () => {
    expect(advanceRide(closing, 0.02, { atDoor: true, reduced: false })).toMatchObject({ stage: "moving", t: 0, held: 0 });
  });
});
