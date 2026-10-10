import { AdditiveBlending, Color } from "three";
import { describe, expect, it } from "vitest";
import { createGlassMaterial, createGridFloorMaterial, createLaneMaterial, neonColor } from "@/experience/fx/materials";

describe("fx materials", () => {
  it("glass material is transparent, no depth write, with time uniform", () => {
    const m = createGlassMaterial("#a78bfa", 0.035);
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(m.uniforms.uTime.value).toBe(0);
    expect((m.uniforms.uColor.value as Color).getHexString()).toBe("a78bfa");
  });
  it("lane material is additive and scales dashes by length", () => {
    const m = createLaneMaterial("#6366f1", 12);
    expect(m.blending).toBe(AdditiveBlending);
    expect(m.uniforms.uLen.value).toBe(12);
  });
  it("grid floor fades by radius", () => {
    expect(createGridFloorMaterial({ line: "#4f46e5", bg: "#05050c", radius: 32 }).uniforms.uRadius.value).toBe(32);
  });
  it("neonColor boosts only on the full tier", () => {
    expect(neonColor("#67e8f9", 3, "full").g).toBeGreaterThan(1);
    expect(neonColor("#67e8f9", 3, "lite").g).toBeLessThanOrEqual(1);
  });
});
