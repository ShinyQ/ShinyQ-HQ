import { describe, expect, it } from "vitest";
import { HALL } from "@/experience/floors/lobby/hallLayout";
import { shouldLoadHallPremium } from "@/experience/floors/lobby/hallPremium/chunk";

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
  it("loads for a drive heading into the hall (its target past HALL.lazyX)", () => {
    expect(shouldLoadHallPremium({ floor: "L1", x: Math.max(0, HALL.plaza.x), idle: false, intent: false })).toBe(true);
  });
});
