import { describe, expect, it } from "vitest";
import { belowParkedCar, floorContentVisible } from "@/experience/tower/near";

const at = (over: Partial<Parameters<typeof floorContentVisible>[0]>) =>
  floorContentVisible({ floorY: 14, roverY: 14, exterior: false, ride: null, ready: true, ...over });

describe("floor content visibility", () => {
  it("draws the rover's floor and hides ghost floors above it", () => {
    expect(at({})).toBe(true);
    expect(at({ floorY: 28 })).toBe(false);
  });

  it("hides content under the slab while exploring and shows it during a ride", () => {
    expect(at({ floorY: 0 })).toBe(false);
    expect(at({ floorY: 0, ride: { stage: "boarding" } })).toBe(true);
    expect(at({ floorY: 0, ride: { stage: "moving" } })).toBe(true);
  });

  it("keeps a floor below that is still compiling hidden until the car moves", () => {
    for (const stage of ["toDoor", "boarding", "closing"] as const) expect(at({ floorY: 0, ready: false, ride: { stage } })).toBe(false);
    expect(at({ floorY: 0, ready: false, ride: { stage: "moving" } })).toBe(true);
  });

  it("hides the floors below once the car is parked at the target (the arrival glide starts in the car)", () => {
    for (const stage of ["opening", "exiting"] as const) {
      expect(at({ floorY: 0, ride: { stage } })).toBe(false);
      expect(at({ floorY: 0, ready: false, ride: { stage } })).toBe(false);
      expect(at({ ride: { stage } })).toBe(true);
    }
  });

  it("draws everything in the exterior boot and intro", () => {
    expect(at({ floorY: 28, exterior: true })).toBe(true);
    expect(at({ floorY: 0, exterior: true, ready: false })).toBe(true);
  });
});

describe("belowParkedCar", () => {
  it("is a floor under the rover while the car stands at the target", () => {
    for (const stage of ["opening", "exiting"] as const) {
      expect(belowParkedCar(0, 14, { stage })).toBe(true);
      expect(belowParkedCar(14, 14, { stage })).toBe(false);
      expect(belowParkedCar(28, 14, { stage })).toBe(false);
    }
    for (const stage of ["toDoor", "boarding", "closing", "moving"] as const) expect(belowParkedCar(0, 14, { stage })).toBe(false);
    expect(belowParkedCar(0, 14, null)).toBe(false);
  });
});
