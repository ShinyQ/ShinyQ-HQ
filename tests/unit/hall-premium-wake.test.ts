import { expect, it } from "vitest";
import { eased, wakeLevel } from "@/experience/floors/lobby/hallPremium/wake";

it("rises to 1 in about 0.8 s when docked and settles back", () => {
  let w = 0;
  for (let i = 0; i < 48; i++) w = wakeLevel(w, true, 1 / 60, false);
  expect(w).toBeCloseTo(1, 1);
  for (let i = 0; i < 120; i++) w = wakeLevel(w, false, 1 / 60, false);
  expect(w).toBeLessThan(0.05);
});

it("jumps without animation under reduced motion", () => {
  expect(wakeLevel(0, true, 1 / 60, true)).toBe(1);
  expect(wakeLevel(1, false, 1 / 60, true)).toBe(0);
});

it("eases from 0 to 1", () => {
  expect(eased(0)).toBe(0);
  expect(eased(1)).toBe(1);
  expect(eased(0.5)).toBe(0.5);
});
