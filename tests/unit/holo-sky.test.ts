import { describe, expect, it } from "vitest";
import { createHoloMaterial, HOLO_FS, HOLO_MODE } from "@/experience/fx/holoFx";

describe("holo sky and orb modes on the shared program", () => {
  it("registers the sky and orb modes after the dot mode", () => {
    expect(HOLO_MODE.sky).toBe(12);
    expect(HOLO_MODE.orb).toBe(13);
  });

  it("declares the sun and glow uniforms and branches on both modes", () => {
    expect(HOLO_FS).toContain("uniform vec3 uSun");
    expect(HOLO_FS).toContain("uniform vec3 uGlow");
    expect(HOLO_FS).toContain("uMode == 12");
    expect(HOLO_FS).toContain("uMode == 13");
  });

  it("gives every material the sun and glow uniforms", () => {
    const sky = createHoloMaterial({ mode: HOLO_MODE.sky });
    expect(sky.uniforms.uSun.value.toArray()).toEqual([0, 1, 0]);
    expect(sky.uniforms.uGlow.value.getHex()).toBe(0);
  });

  it("shares one program between the sky, orb and plate materials", () => {
    const sky = createHoloMaterial({ mode: HOLO_MODE.sky });
    const orb = createHoloMaterial({ mode: HOLO_MODE.orb });
    const plate = createHoloMaterial({ mode: HOLO_MODE.plate });
    expect(sky.vertexShader).toBe(orb.vertexShader);
    expect(sky.fragmentShader).toBe(orb.fragmentShader);
    expect(sky.fragmentShader).toBe(plate.fragmentShader);
  });
});
