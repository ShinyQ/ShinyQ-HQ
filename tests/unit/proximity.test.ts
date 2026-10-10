import { expect, it } from "vitest";
import { proximityLevel } from "@/experience/fx/proximity";

it("glows brighter as the rover approaches a door", () => {
  expect(proximityLevel(10)).toBe(0.15);
  expect(proximityLevel(6)).toBe(0.15);
  expect(proximityLevel(1.5)).toBe(0.8);
  expect(proximityLevel(0)).toBe(0.8);
  expect(proximityLevel(3.75)).toBeCloseTo(0.475);
});
