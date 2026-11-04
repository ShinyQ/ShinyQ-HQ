import { describe, expect, it } from "vitest";
import { HALL } from "@/experience/floors/lobby/hallLayout";
import { inHall, shouldLoadHallPremium } from "@/experience/floors/lobby/hallPremium/chunk";

describe("hall interiors trigger (owner decision 2026-11-04)", () => {
  it("loads at idle on L1", () => {
    expect(shouldLoadHallPremium({ floor: "L1", x: 0, idle: true, intent: false })).toBe(true);
  });
  it("loads on a hall intent or near the hall before idle", () => {
    expect(shouldLoadHallPremium({ floor: "L1", x: 0, idle: false, intent: true })).toBe(true);
    expect(shouldLoadHallPremium({ floor: "L1", x: HALL.lazyX + 1, idle: false, intent: false })).toBe(true);
  });
  it("waits otherwise and never loads off L1", () => {
    expect(shouldLoadHallPremium({ floor: "L1", x: 0, idle: false, intent: false })).toBe(false);
    expect(shouldLoadHallPremium({ floor: "L3", x: 99, idle: true, intent: true })).toBe(false);
  });
  it("reads a drive's target in the hall as an intent", () => {
    expect(inHall({ x: HALL.plaza.x, z: HALL.plaza.z })).toBe(true);
    expect(inHall({ x: 0, z: 0 })).toBe(false);
  });
});
