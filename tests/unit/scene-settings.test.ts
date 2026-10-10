import { expect, it } from "vitest";
import { sceneSettings } from "@/experience/scene/settings";

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
  expect(sceneSettings("full", "rail").fog).toMatchObject({ near: 30, far: 70 });
  const intro = sceneSettings("lite", "intro").fog;
  expect(intro.near).toBeGreaterThan(80);
  expect(intro.far).toBeGreaterThan(intro.near);
});
