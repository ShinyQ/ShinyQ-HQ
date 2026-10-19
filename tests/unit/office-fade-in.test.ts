import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";
import { createHoloMaterial, HOLO_MODE } from "@/experience/fx/holoFx";
import { OFFICE_FADE_IN, officeFadeSlots, setOfficeFade } from "@/experience/floors/lobby/office/OfficeMount";

/**
 * The live office fades in once it shows (owner request, final round): the Rovers' hashed-alpha parts and screens, the
 * wall and the holo glow scale their opacity from 0 to their own value over `OFFICE_FADE_IN`, on the main path (the
 * office chunk is at its byte cap), without a new program: only opacities and the holo `uOpacity` uniform change.
 */
describe("the office fade-in", () => {
  const geometry = new BoxGeometry();
  const parts = new MeshStandardMaterial({ alphaHash: true });
  const wall = new MeshBasicMaterial({ alphaHash: true, opacity: 0.8 });
  const plain = new MeshBasicMaterial();
  const glow = createHoloMaterial({ mode: HOLO_MODE.dot, color: "#ffffff", opacity: 0.6 });
  const root = new Group();
  root.add(new Mesh(geometry, parts), new Mesh(geometry, parts), new Mesh(geometry, wall), new Mesh(geometry, plain), new Mesh(geometry, glow));

  it("lasts about a quarter second", () => {
    expect(OFFICE_FADE_IN).toBeGreaterThanOrEqual(0.2);
    expect(OFFICE_FADE_IN).toBeLessThanOrEqual(0.3);
  });

  it("scales each hashed-alpha material once and the holo uniform, and leaves other materials alone", () => {
    const slots = officeFadeSlots(root);
    expect(slots.map((s) => s.material)).toEqual([parts, wall, glow]);
    const programs = [parts, wall, glow].map((m) => m.version);
    setOfficeFade(slots, 0);
    expect([parts.opacity, wall.opacity, glow.uniforms.uOpacity.value, plain.opacity]).toEqual([0, 0, 0, 1]);
    setOfficeFade(slots, 0.5);
    expect(parts.opacity).toBeCloseTo(0.5);
    expect(wall.opacity).toBeCloseTo(0.4);
    expect(glow.uniforms.uOpacity.value).toBeCloseTo(0.3);
    setOfficeFade(slots, 1);
    expect([parts.opacity, wall.opacity, glow.uniforms.uOpacity.value]).toEqual([1, 0.8, 0.6]);
    // No material was flagged for a recompile.
    expect([parts, wall, glow].map((m) => m.version)).toEqual(programs);
    expect([parts.alphaHash, wall.alphaHash, glow.transparent]).toEqual([true, true, true]);
  });

  it("is driven by frame deltas, cut under reduced motion, from the main-path mount", () => {
    const mount = readFileSync(join(process.cwd(), "src/experience/floors/lobby/office/OfficeMount.tsx"), "utf8");
    expect(mount).toMatch(/reducedMotion \? OFFICE_FADE_IN : f\.t \+ Math\.min\(rawDt, MAX_FRAME_DT\) \* animationSpeed\(\)/);
    expect(mount).toMatch(/sceneProbes\.office\.loaded/);
  });
});
