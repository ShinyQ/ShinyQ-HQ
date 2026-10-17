import { expect, it } from "vitest";
import { FLOOR_GAP, floorY } from "@/experience/config";
import { contentVisible, INTRO_GHOST_BY, introGhost, RIDE_BELOW_REACH } from "@/experience/tower/visibility";

const at = (id: "L1" | "L2" | "L3" | "L4" | "RF", roverY: number, extra: { exterior?: boolean; rideTo?: "L1" | "L2" | "L3" | "L4" | "RF" | null; introFly?: number } = {}) =>
  contentVisible({ id, floorY: floorY(id), roverY, exterior: extra.exterior ?? false, rideTo: extra.rideTo ?? null, introFly: extra.introFly });

it("shows the Lobby's and L2's detail in the boot and intro exterior (the opening shot frames L2), nothing above", () => {
  expect(at("L1", 0, { exterior: true })).toBe(true);
  expect(at("L2", 0, { exterior: true })).toBe(true);
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

it("intro fly-in: once the camera flies in, L2's detail goes (it would cover the Lobby through its fading slab)", () => {
  expect(at("L2", 0, { exterior: true, introFly: -1 })).toBe(true);
  expect(at("L2", 0, { exterior: true, introFly: 0 })).toBe(false);
  expect(at("L2", 0, { exterior: true, introFly: 0.6 })).toBe(false);
  expect(at("L1", 0, { exterior: true, introFly: 0.6 })).toBe(true);
});

it("intro fly-in: the slabs above the rover fade from solid to ghosts over the first part of the fly-in", () => {
  expect(introGhost(-1)).toBe(0);
  expect(introGhost(0)).toBe(0);
  expect(introGhost(INTRO_GHOST_BY)).toBe(1);
  expect(introGhost(1)).toBe(1);
  let prev = 0;
  for (let i = 1; i <= 50; i++) {
    const g = introGhost((INTRO_GHOST_BY * i) / 50);
    expect(g).toBeGreaterThanOrEqual(prev);
    prev = g;
  }
  expect(INTRO_GHOST_BY).toBeLessThan(1);
});
