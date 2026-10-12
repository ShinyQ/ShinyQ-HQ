import { beforeEach, describe, expect, it } from "vitest";
import {
  beginFloorPrep,
  destinationReady,
  endFloorPrep,
  finishFloorPrep,
  floorReady,
  resetRidePrep,
  ridePrep,
  textDone,
  textStarted,
} from "@/experience/tower/ridePrep";

beforeEach(resetRidePrep);

describe("ride preparation", () => {
  it("marks a floor ready once its programs compiled, never before it mounts", () => {
    expect(floorReady("L3")).toBe(false);
    const token = beginFloorPrep("L3");
    expect(floorReady("L3")).toBe(false);
    finishFloorPrep("L3", token);
    expect(floorReady("L3")).toBe(true);
    endFloorPrep("L3", token);
    expect(floorReady("L3")).toBe(false);
  });

  it("ignores a compile that finishes after its mount was replaced", () => {
    const first = beginFloorPrep("L3");
    endFloorPrep("L3", first);
    const second = beginFloorPrep("L3");
    finishFloorPrep("L3", first);
    expect(floorReady("L3")).toBe(false);
    endFloorPrep("L3", first);
    expect(ridePrep.floors.has("L3")).toBe(true);
    finishFloorPrep("L3", second);
    expect(floorReady("L3")).toBe(true);
  });

  it("waits for every compiling floor and for the destination's texts", () => {
    finishFloorPrep("L3", beginFloorPrep("L3"));
    const l4 = beginFloorPrep("L4");
    expect(destinationReady("L3")).toBe(false);
    finishFloorPrep("L4", l4);
    expect(destinationReady("L3")).toBe(true);
    textStarted("L3");
    textStarted("L4");
    expect(destinationReady("L3")).toBe(false);
    textDone("L3");
    expect(destinationReady("L3")).toBe(true);
  });

  it("never counts texts below zero", () => {
    textDone("L2");
    expect(ridePrep.texts.get("L2")).toBe(0);
  });
});
