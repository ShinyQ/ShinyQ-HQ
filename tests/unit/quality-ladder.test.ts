import { expect, it } from "vitest";
import { bloomLevelsFor, qualityAt, qualityLadder, startDpr } from "@/experience/scene/quality";
import { renderBudget } from "@/experience/scene/settings";

const retina = renderBudget("full", false, { width: 1440, height: 900, dpr: 2 });
const desktop = renderBudget("full", false, { width: 2560, height: 1440, dpr: 1 });
const phone = renderBudget("lite", true, { width: 390, height: 844, dpr: 3 });

it("starts where R3F would: the device DPR clamped into the budget", () => {
  expect(startDpr(retina, 2)).toBe(2);
  expect(startDpr(desktop, 1)).toBe(1);
  expect(startDpr(phone, 3)).toBe(1.25);
  expect(startDpr(desktop, 0.9)).toBe(1);
});

it("keeps the glow's on-screen size when the canvas shrinks", () => {
  expect(bloomLevelsFor(1)).toBe(8);
  expect(bloomLevelsFor(0.85)).toBe(8);
  expect(bloomLevelsFor(0.7)).toBe(7);
  expect(bloomLevelsFor(0.3)).toBe(6);
  expect(bloomLevelsFor(0.01)).toBe(5);
});

it("orders steps pixels first, MSAA next, bloom last, and skips steps that change nothing", () => {
  expect(qualityLadder(retina, "full", 2)).toEqual(["dpr-85", "dpr-70", "bloom-lite"]);
  expect(qualityLadder(desktop, "full", 1)).toEqual(["msaa-off", "bloom-lite"]);
  expect(qualityLadder(phone, "lite", 3)).toEqual(["dpr-85", "dpr-70"]);
  expect(qualityLadder(renderBudget("lite", false, { width: 1440, height: 900, dpr: 1 }), "lite", 1)).toEqual([]);
});

it("level 0 is exactly the budget, so nothing changes until the monitor acts", () => {
  expect(qualityAt(retina, "full", 2, 0)).toEqual({ level: 0, dpr: 2, multisampling: 0, bloomLevels: 8 });
  expect(qualityAt(desktop, "full", 1, 0)).toEqual({ level: 0, dpr: 1, multisampling: 4, bloomLevels: 8 });
});

it("walks the Retina ladder", () => {
  expect(qualityAt(retina, "full", 2, 1)).toEqual({ level: 1, dpr: 1.7, multisampling: 0, bloomLevels: 8 });
  expect(qualityAt(retina, "full", 2, 2)).toEqual({ level: 2, dpr: 1.4, multisampling: 0, bloomLevels: 7 });
  expect(qualityAt(retina, "full", 2, 3)).toEqual({ level: 3, dpr: 1.4, multisampling: 0, bloomLevels: 5 });
  expect(qualityAt(retina, "full", 2, 9).level).toBe(3);
});

it("walks the DPR 1 desktop ladder: MSAA first, bloom last", () => {
  expect(qualityAt(desktop, "full", 1, 1)).toEqual({ level: 1, dpr: 1, multisampling: 0, bloomLevels: 8 });
  expect(qualityAt(desktop, "full", 1, 2)).toEqual({ level: 2, dpr: 1, multisampling: 0, bloomLevels: 6 });
});

it("walks the phone ladder down to DPR 1", () => {
  expect(qualityAt(phone, "lite", 3, 1).dpr).toBe(1.06);
  expect(qualityAt(phone, "lite", 3, 2).dpr).toBe(1);
});
