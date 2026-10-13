import { describe, expect, it } from "vitest";
import { floorContentVisible } from "@/experience/tower/near";

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
    for (const stage of ["moving", "opening", "exiting"] as const) expect(at({ floorY: 0, ready: false, ride: { stage } })).toBe(true);
  });

  it("draws everything in the exterior boot and intro", () => {
    expect(at({ floorY: 28, exterior: true })).toBe(true);
    expect(at({ floorY: 0, exterior: true, ready: false })).toBe(true);
  });
});
