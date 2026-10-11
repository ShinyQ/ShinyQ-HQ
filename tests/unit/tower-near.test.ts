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
