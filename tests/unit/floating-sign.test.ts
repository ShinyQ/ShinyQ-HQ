import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SIGN_PAD, signFacing, signFacingDot, signPlate } from "@/experience/fx/signLayout";
import { createHoloMaterial, HOLO_FS, HOLO_MODE, HOLO_VS } from "@/experience/fx/holoFx";

describe("floating signs", () => {
  it("sizes the plate to the monospace text plus padding", () => {
    const short = signPlate({ text: "2021", fontSize: 1 });
    const long = signPlate({ text: "RESEARCH", fontSize: 1 });
    const big = signPlate({ text: "2021", fontSize: 3 });
    expect(long.w).toBeGreaterThan(short.w);
    expect(big.w).toBeCloseTo(short.w * 3);
    expect(short.w).toBeCloseTo(4 * 0.6 + 2 * SIGN_PAD.x);
    expect(signPlate({ text: "A\nB", fontSize: 1 }).h).toBeGreaterThan(short.h);
  });

  it("turns a sign square to the camera from every direction, never showing its back", () => {
    const at = { x: 10, z: -4 };
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const camera = { x: at.x + Math.cos(a) * 30, z: at.z + Math.sin(a) * 30 };
      const yaw = signFacing(at, camera);
      expect(signFacingDot(yaw, at, camera)).toBeCloseTo(1, 6);
      // The same yaw seen from the opposite side would show the back.
      expect(signFacingDot(yaw, at, { x: 2 * at.x - camera.x, z: 2 * at.z - camera.z })).toBeCloseTo(-1, 6);
    }
  });
});

describe("holo fx shader", () => {
  it("shares one program for every mode and declares each mode branch", () => {
    const modes = Object.values(HOLO_MODE);
    expect(new Set(modes).size).toBe(modes.length);
    for (const m of modes.slice(0, -1)) expect(HOLO_FS).toContain(`uMode == ${m}`);
    const a = createHoloMaterial({ mode: HOLO_MODE.plate });
    const b = createHoloMaterial({ mode: HOLO_MODE.fall, fade: [10, 40] });
    expect(a.vertexShader).toBe(b.vertexShader);
    expect(a.fragmentShader).toBe(b.fragmentShader);
    expect(a.fog).toBe(false);
    expect(b.uniforms.uFade.value.toArray()).toEqual([10, 40]);
    expect(HOLO_VS).toContain("USE_INSTANCING");
  });

  it("draws holo materials only on instanced meshes, so they compile to one program", () => {
    for (const file of ["fx/FloatingSign.tsx", "fx/HoloMesh.tsx", "floors/career/Horizon.tsx", "floors/labs/ReactorCore.tsx", "floors/labs/ReactorHighlights.tsx", "floors/lobby/HallFx.tsx"]) {
      const source = readFileSync(join(__dirname, "../../src/experience", file), "utf8");
      expect(source, file).not.toMatch(/<mesh[\s>]/);
      expect(source, file).toMatch(/instancedMesh/);
    }
  });

  it("never contains an em dash", () => {
    expect(HOLO_FS + HOLO_VS).not.toMatch(/\u2014/);
  });
});
