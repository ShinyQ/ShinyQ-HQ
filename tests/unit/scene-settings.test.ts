import { expect, it } from "vitest";
import { parseGfxOverride, renderBudget, sceneSettings, withOverride } from "@/experience/scene/settings";

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

it("keeps the desktop look and renders fewer pixels on touch devices", () => {
  expect(renderBudget("full", false)).toEqual({ dpr: [1, 2], multisampling: 4, bloomLevels: 8 });
  expect(renderBudget("lite", false)).toEqual({ dpr: [1, 1.5], multisampling: 0, bloomLevels: 8 });
  // Phones and tablets: the composer's MSAA and DPR 2 cost 4 to 7x the lite frame.
  expect(renderBudget("full", true)).toEqual({ dpr: [1, 1.5], multisampling: 0, bloomLevels: 8 });
  expect(renderBudget("lite", true).dpr[1]).toBeLessThanOrEqual(1.25);
});

it("parses the ?gfx= debug override and ignores junk", () => {
  expect(parseGfxOverride("?gfx=msaa0,dpr1.5,bloom5,monitor-off")).toEqual({ multisampling: 0, dprMax: 1.5, bloomLevels: 5, monitor: false });
  expect(parseGfxOverride("?gfx=monitor-on")).toEqual({ monitor: true });
  expect(parseGfxOverride("?gfx=msaa3,dpr9,bloom0,hello")).toEqual({});
  expect(parseGfxOverride("?tier=full")).toEqual({});
});

it("applies an override on top of a budget", () => {
  const base = { dpr: [1, 2] as [number, number], multisampling: 4, bloomLevels: 8 };
  expect(withOverride(base, {})).toEqual(base);
  expect(withOverride(base, { dprMax: 1.5, multisampling: 0, bloomLevels: 5 })).toEqual({ dpr: [1, 1.5], multisampling: 0, bloomLevels: 5 });
  expect(withOverride(base, { dprMax: 0.75 })).toEqual({ dpr: [0.75, 0.75], multisampling: 4, bloomLevels: 8 });
});
