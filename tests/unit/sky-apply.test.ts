import { describe, expect, it } from "vitest";
import { InstancedBufferAttribute, InstancedMesh, Matrix4, Object3D, PlaneGeometry, Vector3 } from "three";
import { createHoloMaterial, HOLO_MODE } from "@/experience/fx/holoFx";
import { applyDome, applyOrbs } from "@/experience/sky/applySky";
import { SKY_PHASES, skyState } from "@/experience/sky/dayNight";

function rig() {
  const material = createHoloMaterial({ mode: HOLO_MODE.sky, additive: false });
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, 2);
  const alpha = new InstancedBufferAttribute(new Float32Array(2), 1);
  return { material, mesh, alpha, scratch: new Object3D() };
}

describe("sky writers", () => {
  it("still night zeroes the stars and the sun and moon alphas", () => {
    const { material, mesh, alpha, scratch } = rig();
    const state = skyState(SKY_PHASES.night);
    applyDome(material, state, true);
    applyOrbs(mesh, alpha, state, scratch, true);
    expect(material.uniforms.uParams.value.y).toBe(0);
    expect(alpha.getX(0)).toBe(0);
    expect(alpha.getX(1)).toBe(0);
  });

  it("night without still keeps the stars and shows the moon", () => {
    const { material, mesh, alpha, scratch } = rig();
    const state = skyState(SKY_PHASES.night);
    applyDome(material, state, false);
    applyOrbs(mesh, alpha, state, scratch, false);
    expect(material.uniforms.uParams.value.y).toBe(state.stars);
    expect(material.uniforms.uParams.value.y).toBe(1);
    expect(alpha.getX(1)).toBeGreaterThan(0);
  });

  it("day shows the sun and tints the dome to the state colors", () => {
    const { material, mesh, alpha, scratch } = rig();
    const state = skyState(SKY_PHASES.day);
    applyDome(material, state, false);
    applyOrbs(mesh, alpha, state, scratch, false);
    expect(alpha.getX(0)).toBeGreaterThan(0);
    expect(material.uniforms.uColor.value.getHex()).toBe(state.zenith.getHex());
    expect(material.uniforms.uFill.value.getHex()).toBe(state.horizon.getHex());
    expect(material.uniforms.uGlow.value.getHex()).toBe(state.glow.getHex());
  });

  it("places the sun instance along the sun direction at the orb radius", () => {
    const { mesh, alpha, scratch } = rig();
    const state = skyState(SKY_PHASES.day);
    applyOrbs(mesh, alpha, state, scratch, false);
    const m = new Matrix4();
    mesh.getMatrixAt(0, m);
    const position = new Vector3().setFromMatrixPosition(m);
    // The instance matrix is stored as float32, so the radius is only exact to about 1e-4.
    expect(position.length()).toBeCloseTo(380, 3);
    const placed = position.clone().normalize();
    const expected = state.sun.dir.clone().normalize();
    expect(placed.distanceTo(expected)).toBeLessThan(1e-6);
  });
});
