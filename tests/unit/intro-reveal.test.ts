import { Vector2 } from "three";
import { afterEach, describe, expect, it } from "vitest";
import { createGridFloorMaterial, createLaneMaterial } from "@/experience/fx/materials";
import { introRuntime, resetIntroRuntime, revealUniforms, setReveal } from "@/experience/intro/runtime";

const grids = () => [
  createGridFloorMaterial({ line: "#4f46e5", bg: "#0a0a0f", radius: 32 }),
  createGridFloorMaterial({ line: "#22d3ee", bg: "#0a0a0f", radius: 12, center: [4, -6] }),
];
const lanes = () => [createLaneMaterial("#6366f1", 1), createLaneMaterial("#a78bfa", 12)];

describe("intro reveal runtime", () => {
  afterEach(() => resetIntroRuntime());

  it("starts with the reveal off", () => {
    expect(revealUniforms.uReveal.value).toBe(1e5);
    expect(revealUniforms.uRevealAt.value).toBeInstanceOf(Vector2);
    expect(introRuntime).toEqual({ active: false, t: -1, reveal: Infinity, heading: null, face: null, veil: 0, lit: [], skipped: false });
  });

  it("every grid and lane material shares the reveal uniforms by reference", () => {
    for (const m of [...grids(), ...lanes()]) {
      expect(m.uniforms.uReveal).toBe(revealUniforms.uReveal);
      expect(m.uniforms.uRevealAt).toBe(revealUniforms.uRevealAt);
      expect(m.fragmentShader).toContain("uReveal");
      expect(m.fragmentShader).toContain("uRevealAt");
    }
  });

  it("one write reaches every material", () => {
    const all = [...grids(), ...lanes()];
    setReveal(7.5, { x: -3, z: 9 });
    for (const m of all) {
      expect(m.uniforms.uReveal.value).toBe(7.5);
      expect((m.uniforms.uRevealAt.value as Vector2).toArray()).toEqual([-3, 9]);
    }
  });

  it("setReveal(Infinity) writes 1e5 to the shaders and keeps Infinity on the runtime", () => {
    setReveal(4, { x: 0, z: 0 });
    setReveal(Infinity, { x: 5, z: 6 });
    expect(revealUniforms.uReveal.value).toBe(1e5);
    expect(introRuntime.reveal).toBe(Infinity);
  });

  it("setReveal(12, at) writes the radius and the origin", () => {
    setReveal(12, { x: 1, z: 2 });
    expect(revealUniforms.uReveal.value).toBe(12);
    expect(introRuntime.reveal).toBe(12);
    expect(revealUniforms.uRevealAt.value.x).toBe(1);
    expect(revealUniforms.uRevealAt.value.y).toBe(2);
  });

  it("resetIntroRuntime restores every default", () => {
    const at = revealUniforms.uRevealAt.value;
    Object.assign(introRuntime, { active: true, t: 3.2, heading: 1.1, face: "boot", veil: 0.6, skipped: true });
    introRuntime.lit.push("lobby", "kiosk");
    setReveal(9, { x: 2, z: 3 });
    resetIntroRuntime();
    expect(introRuntime).toEqual({ active: false, t: -1, reveal: Infinity, heading: null, face: null, veil: 0, lit: [], skipped: false });
    expect(revealUniforms.uReveal.value).toBe(1e5);
    expect(revealUniforms.uRevealAt.value).toBe(at);
    expect(at.toArray()).toEqual([0, 0]);
  });
});
