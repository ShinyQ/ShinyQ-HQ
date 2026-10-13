import { expect, it } from "vitest";
import { nearFloors } from "@/experience/tower/near";

it("mounts the floor and its neighbours once the first frames are done", () => {
  expect(nearFloors("L2", null, false)).toEqual(["L1", "L2", "L3"]);
  expect(nearFloors("RF", null, false)).toEqual(["L4", "RF"]);
});

it("mounts only the current floor (and a ride target) before that", () => {
  expect(nearFloors("L2", null, false, 0)).toEqual(["L2"]);
  expect(nearFloors("L2", "L4", false, 0)).toEqual(["L2", "L4"]);
  expect(nearFloors("L3", null, true, 0)).toEqual(["L1", "L3"]);
});

it("adds the floor being warmed during boot", () => {
  expect(nearFloors("L1", null, true, 1, "RF")).toEqual(["L1", "L2", "RF"]);
  expect(nearFloors("L1", null, true, 0, "L4")).toEqual(["L1", "L4"]);
  expect(nearFloors("L1", null, true, 1, null)).toEqual(["L1", "L2"]);
});
