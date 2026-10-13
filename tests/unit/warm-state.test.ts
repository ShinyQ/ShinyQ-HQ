import { afterEach, expect, it, vi } from "vitest";
import { listWarm, markWarm, resetWarm, warmingFloor, warmQueue } from "@/experience/scene/warmState";

afterEach(() => {
  resetWarm();
  warmingFloor.set(null);
});

it("warms the other floors in likely visiting order, skipping warm ones", () => {
  expect(warmQueue("L1")).toEqual(["L3", "L2", "RF", "L4"]);
  markWarm("L3");
  expect(warmQueue("L1")).toEqual(["L2", "RF", "L4"]);
  expect(listWarm()).toEqual(["L3"]);
});

it("notifies only on a change of the warming floor", () => {
  const listener = vi.fn();
  const off = warmingFloor.subscribe(listener);
  warmingFloor.set("L2");
  warmingFloor.set("L2");
  warmingFloor.set(null);
  expect(listener).toHaveBeenCalledTimes(2);
  off();
});
