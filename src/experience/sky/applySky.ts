import { Color, InstancedBufferAttribute, Object3D, type InstancedMesh, type ShaderMaterial } from "three";
import { SKY, type Orb, type SkyState } from "./dayNight";

const ORB_RADIUS = 380;
const SUN_SIZE = 36;
const MOON_SIZE = 30;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Copies the sky state into the dome's uniforms. */
export function applyDome(material: ShaderMaterial, state: SkyState): void {
  const u = material.uniforms;
  (u.uColor.value as Color).copy(state.zenith);
  (u.uFill.value as Color).copy(state.horizon);
  (u.uGlow.value as Color).copy(state.glow);
  u.uSun.value.copy(state.sun.dir);
  u.uParams.value.x = Math.sin(SKY.horizon);
  u.uParams.value.y = state.stars;
}

/** Places the sun (instance 0) and the moon (instance 1) on the sky sphere, facing the center, with their horizon fade. */
export function applyOrbs(mesh: InstancedMesh, alpha: InstancedBufferAttribute, state: SkyState, scratch: Object3D): void {
  const place = (i: number, o: Orb, size: number) => {
    scratch.position.copy(o.dir).multiplyScalar(ORB_RADIUS);
    scratch.lookAt(0, 0, 0);
    scratch.scale.setScalar(size);
    scratch.updateMatrix();
    mesh.setMatrixAt(i, scratch.matrix);
    alpha.setX(i, smoothstep(SKY.horizon - 0.06, SKY.horizon + 0.03, o.elevation));
  };
  place(0, state.sun, SUN_SIZE);
  place(1, state.moon, MOON_SIZE);
  mesh.instanceMatrix.needsUpdate = true;
  alpha.needsUpdate = true;
}
