import { describe, expect, it } from "vitest";
import { FLOOR_GAP, floorY } from "@/experience/config";
import { floorContentVisible } from "@/experience/tower/near";
import { contentVisible, RIDE_BELOW_REACH } from "@/experience/tower/visibility";

const at = (id: "L1" | "L2" | "L3" | "L4" | "RF", roverY: number, extra: { exterior?: boolean; rideTo?: "L1" | "L2" | "L3" | "L4" | "RF" | null } = {}) =>
  contentVisible({ id, floorY: floorY(id), roverY, exterior: extra.exterior ?? false, rideTo: extra.rideTo ?? null });

it("shows only the Lobby's detail in the boot and intro exterior", () => {
  expect(at("L1", 0, { exterior: true })).toBe(true);
  expect(at("L2", 0, { exterior: true })).toBe(false);
  expect(at("L3", 0, { exterior: true })).toBe(false);
  expect(at("RF", 0, { exterior: true })).toBe(false);
});

it("explore: the rover's floor shows, floors above and below do not (unchanged)", () => {
  expect(at("L2", floorY("L2"))).toBe(true);
  expect(at("L3", floorY("L2"))).toBe(false);
  expect(at("L1", floorY("L2"))).toBe(false);
});

it("ride: the target floor below always shows", () => {
  expect(at("L1", floorY("RF"), { rideTo: "L1" })).toBe(true);
});

it("ride: a passing floor below shows only within reach of the car", () => {
  expect(at("L2", floorY("RF"), { rideTo: "L1" })).toBe(false);
  expect(at("L2", floorY("L2") + RIDE_BELOW_REACH - 0.1, { rideTo: "L1" })).toBe(true);
  expect(at("L4", floorY("RF"), { rideTo: "L1" })).toBe(RIDE_BELOW_REACH >= FLOOR_GAP);
});

it("ride: floors above the car stay hidden until the car reaches them", () => {
  expect(at("L2", floorY("L1") + 3, { rideTo: "L2" })).toBe(false);
  expect(at("L2", floorY("L2") - 0.4, { rideTo: "L2" })).toBe(true);
});

describe("a floor below the Lobby (B1)", () => {
  const onB1 = { roverY: floorY("B1"), exterior: false };
  it("ghosts every floor above B1 and draws B1 itself", () => {
    for (const id of ["L1", "L2", "L3", "L4", "RF"] as const) expect(contentVisible({ id, floorY: floorY(id), ...onB1, rideTo: null }), id).toBe(false);
    expect(contentVisible({ id: "B1", floorY: floorY("B1"), ...onB1, rideTo: null })).toBe(true);
  });

  it("shows B1 during rides down to it, from the Lobby and from the roof", () => {
    // Mid ride from RF: the car is between L2 and L1; B1, the target, draws; floors above the car do not.
    const roverY = 7;
    expect(contentVisible({ id: "B1", floorY: floorY("B1"), roverY, exterior: false, rideTo: "B1" })).toBe(true);
    expect(contentVisible({ id: "L1", floorY: floorY("L1"), roverY, exterior: false, rideTo: "B1" })).toBe(true);
    expect(contentVisible({ id: "L3", floorY: floorY("L3"), roverY, exterior: false, rideTo: "B1" })).toBe(false);
    // Parked at B1 with the doors opening: nothing below B1 exists, B1 draws.
    expect(floorContentVisible({ floorY: floorY("B1"), roverY: floorY("B1"), exterior: false, ride: { stage: "opening" }, ready: true })).toBe(true);
  });

  it("keeps B1 out of the boot and intro exterior", () => {
    expect(contentVisible({ id: "B1", floorY: floorY("B1"), roverY: 0, exterior: true, rideTo: null })).toBe(false);
  });
});
