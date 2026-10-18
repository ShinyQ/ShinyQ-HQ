import { expect, it } from "vitest";
import { budgetDpr, parseGfxOverride, PIXEL_BUDGET, renderBudget, sceneSettings, withOverride } from "@/experience/scene/settings";

// Bloom keeps the prototype's radius but a higher threshold (0.6, not 0.32): neon is boosted above 1 by
// neonColor, while body text (about 0.9) would otherwise bloom and wash out.
it("matches the prototype on full and drops bloom on lite", () => {
  expect(sceneSettings("full")).toMatchObject({
    fog: { color: "#0a0a0f", near: 38, far: 80 },
    exposure: 1.05,
    hemisphere: ["#8b8cff", "#0a0a0f", 0.7],
    directional: { color: "#dfe3ff", intensity: 1.4, position: [10, 22, 12] },
    bloom: { intensity: 0.9, threshold: 0.6, radius: 0.45 },
  });
  expect(sceneSettings("lite").bloom).toBeNull();
});

it("pushes the fog back for the rail and the exterior intro", () => {
  expect(sceneSettings("full", "rail").fog).toMatchObject({ near: 40, far: 95 });
  const intro = sceneSettings("lite", "intro").fog;
  expect(intro.near).toBeGreaterThan(80);
  expect(intro.far).toBeGreaterThan(intro.near);
});

const MAC = { width: 1440, height: 900, dpr: 2 };

it("keeps DPR 2 on Retina laptops and drops composer MSAA there (DPR already antialiases)", () => {
  expect(renderBudget("full", false, MAC)).toEqual({ dpr: [1, 2], multisampling: 0, bloomLevels: 8 });
  expect(renderBudget("full", false, { width: 1728, height: 1117, dpr: 2 })).toEqual({ dpr: [1, 2], multisampling: 0, bloomLevels: 8 });
});

it("keeps 4x MSAA on DPR 1 desktops, including the 2560x1440 monitor", () => {
  expect(renderBudget("full", false, { width: 2560, height: 1440, dpr: 1 })).toEqual({ dpr: [1, 1.5], multisampling: 4, bloomLevels: 8 });
  expect(renderBudget("full", false, { width: 1920, height: 1080, dpr: 1.25 })).toEqual({ dpr: [1, 2], multisampling: 4, bloomLevels: 8 });
});

it("drops MSAA from DPR 1.5 up (Windows at 150%)", () => {
  expect(renderBudget("full", false, { width: 1707, height: 960, dpr: 1.5 }).multisampling).toBe(0);
});

it("caps DPR by total pixels on very large canvases", () => {
  // 5K display: 2560x1440 CSS at DPR 2 would be 14.7 MP; the budget allows 8.3 MP, so DPR 1.5.
  expect(renderBudget("full", false, { width: 2560, height: 1440, dpr: 2 })).toEqual({ dpr: [1, 1.5], multisampling: 0, bloomLevels: 8 });
  // 4K at DPR 1 fits exactly; larger canvases never go below DPR 1.
  expect(renderBudget("full", false, { width: 3840, height: 2160, dpr: 1 }).dpr).toEqual([1, 1]);
  expect(renderBudget("full", false, { width: 5120, height: 2160, dpr: 1 }).dpr).toEqual([1, 1]);
  expect(budgetDpr(2560, 1440, 2)).toBe(1.5);
  expect(budgetDpr(1440, 900, 2)).toBe(2);
  expect(2560 * 1440 * 1.5 * 1.5).toBeLessThanOrEqual(PIXEL_BUDGET);
});

it("keeps the touch and lite budgets", () => {
  expect(renderBudget("full", true, { width: 1024, height: 1366, dpr: 2 })).toEqual({ dpr: [1, 1.5], multisampling: 0, bloomLevels: 8 });
  expect(renderBudget("lite", true, { width: 390, height: 844, dpr: 3 })).toEqual({ dpr: [1, 1.25], multisampling: 0, bloomLevels: 8 });
  expect(renderBudget("lite", false, MAC)).toEqual({ dpr: [1, 1.5], multisampling: 0, bloomLevels: 8 });
});

it("parses the ?gfx= debug override and ignores junk", () => {
  expect(parseGfxOverride("?gfx=msaa0,dpr1.5,bloom5,monitor-off")).toEqual({ multisampling: 0, dprMax: 1.5, bloomLevels: 5, monitor: false });
  expect(parseGfxOverride("?gfx=monitor-on")).toEqual({ monitor: true });
  expect(parseGfxOverride("?gfx=probe")).toEqual({ probe: true });
  expect(parseGfxOverride("?gfx=probe,monitor-on")).toEqual({ probe: true, monitor: true });
  expect(parseGfxOverride("?gfx=msaa3,dpr9,bloom0,hello")).toEqual({});
  expect(parseGfxOverride("?tier=full")).toEqual({});
});

it("applies an override on top of a budget", () => {
  const base = { dpr: [1, 2] as [number, number], multisampling: 4, bloomLevels: 8 };
  expect(withOverride(base, {})).toEqual(base);
  expect(withOverride(base, { dprMax: 1.5, multisampling: 0, bloomLevels: 5 })).toEqual({ dpr: [1, 1.5], multisampling: 0, bloomLevels: 5 });
  expect(withOverride(base, { dprMax: 0.75 })).toEqual({ dpr: [0.75, 0.75], multisampling: 4, bloomLevels: 8 });
});
