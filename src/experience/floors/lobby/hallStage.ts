import { Color } from "three";
import { neonColor } from "../../fx/materials";
import type { GpuTier, Vec2 } from "../../types";
import type { AtlasCell, ShotQuad } from "./hallContent";
import { ARCH, experienceArch, gateOpening, onFace, type LightInstance, type StatTile } from "./hallGallery";
import { HALL } from "./hallLayout";

/**
 * Highlights Hall effects on the shared holo program (`fx/holoFx.ts`, `HOLO_MODE.stage`), so the gallery
 * adds no shader program of its own (owner budget: at most +2 programs per tier, and the floating
 * gateway sign already brings the holo program to L1): the stage lights (spotlight cones, uplights, the
 * fountain beams, glow pools), the gateway light curtain and the experience portal, the stat tile
 * plates, the screenshots and the portrait hologram, and the beacon's pulse rings. Each effect is an
 * instance with a `kind`, drawn on an `InstancedMesh` with instance colors (one draw call per base shape
 * and blend mode). Pure (Vitest builds the instances in node).
 */
export const STAGE_KIND = {
  beam: 0,
  cone: 1,
  pool: 2,
  curtain: 3,
  portal: 4,
  tile: 5,
  image: 6,
  portrait: 7,
  ring: 8,
} as const;

export type StageKind = (typeof STAGE_KIND)[keyof typeof STAGE_KIND];

/**
 * One instance: position and yaw (the instance matrix; planes read left to right along `right`), its
 * tint (instance color) and the stage attributes: `stage` (kind, then the shape: lights height and
 * bottom and top radius, planes width and height, rings growth and speed), `stage2` (spin, unused,
 * phase, alpha) and `uv` (atlas rect).
 */
export interface StageInstance {
  at: [number, number, number];
  yaw: number;
  color: [number, number, number];
  stage: [number, number, number, number];
  stage2: [number, number, number, number];
  uv: [number, number, number, number];
}

const rgb = (c: Color): [number, number, number] => [c.r, c.g, c.b];
const FULL_UV: [number, number, number, number] = [0, 0, 1, 1];

/** Lights on the unit open cylinder; lite draws them a little fainter. */
export function lightInstances(lights: readonly LightInstance[], tier: GpuTier): StageInstance[] {
  const gain = tier === "full" ? 1 : 0.8;
  return lights.map((l) => ({
    at: [l.x, l.y, l.z],
    yaw: 0,
    color: rgb(new Color(l.color)),
    stage: [STAGE_KIND[l.kind], l.h, l.r0, l.r1],
    stage2: [l.spin, 0, l.phase, l.alpha * gain],
    uv: FULL_UV,
  }));
}

/** Yaw that turns a plane's +x onto `right` (around +y). */
export const yawOfRight = (right: Vec2): number => Math.atan2(0 - right.z, right.x);

/** A vertical plane centered on `center`, `w` along `right` and `h` tall. */
function plane(kind: StageKind, center: readonly [number, number, number], right: Vec2, w: number, h: number, color: [number, number, number], alpha: number, phase = 0, uv: [number, number, number, number] = FULL_UV): StageInstance {
  return { at: [center[0], center[1], center[2]], yaw: yawOfRight(right), color, stage: [kind, w, h, 0], stage2: [0, 0, phase, alpha], uv };
}

/** The gateway arch's light curtain, filling the opening (it sweeps through `uProgress`). */
export function curtainInstance(tier: GpuTier): StageInstance {
  const o = gateOpening();
  return plane(STAGE_KIND.curtain, [o.x, o.top / 2, (o.minZ + o.maxZ) / 2], { x: 0, z: 1 }, o.maxZ - o.minZ, o.top, rgb(neonColor(HALL.tone.about, 1.2, tier)), tier === "full" ? 1 : 0.85);
}

/** The work experience arch's lit opening. */
export function portalInstance(tier: GpuTier): StageInstance {
  const arch = experienceArch();
  return plane(STAGE_KIND.portal, onFace(arch.face, 0, ARCH.h / 2, -ARCH.depth / 2), arch.face.right, arch.opening.w, arch.opening.h, rgb(neonColor(HALL.tone.experience, 1.2, tier)), tier === "full" ? 1 : 0.85);
}

/** Stat tile plates (neon rim in the hall's accent), screenshots and the portrait hologram (atlas cells). */
export function panelInstances(tiles: readonly StatTile[], shots: readonly ShotQuad[], photo: ShotQuad, cells: readonly AtlasCell[], tier: GpuTier): StageInstance[] {
  const width = Math.max(1, ...cells.map((c) => c.x + c.w));
  const rect = (q: ShotQuad): [number, number, number, number] => {
    const cell = cells[q.index];
    return cell ? [cell.x / width, 0, (cell.x + cell.w) / width, 1] : FULL_UV;
  };
  const line = rgb(neonColor(HALL.tone.about, 1.4, tier));
  return [
    ...tiles.map((t) => plane(STAGE_KIND.tile, onFace(t.face, 0, t.y, 0), t.face.right, t.w, t.h, line, 1, t.phase)),
    ...shots.map((q) => plane(STAGE_KIND.image, q.center, q.right, q.w, q.h, [1, 1, 1], 1, 0, rect(q))),
    plane(STAGE_KIND.portrait, photo.center, photo.right, photo.w, photo.h, rgb(new Color("#7dd3fc")), 1, 0, rect(photo)),
  ];
}

/** Pulse rings on the flat unit ring (growth 5, speed 0.45 cycles per second). */
export function ringInstances(sources: readonly { x: number; y: number; z: number; phase: number }[], color: string, tier: GpuTier): StageInstance[] {
  const c = rgb(neonColor(color, 1, tier));
  return sources.map((p) => ({ at: [p.x, p.y, p.z], yaw: 0, color: c, stage: [STAGE_KIND.ring, 5, 0.45, 0], stage2: [0, 0, p.phase, 1], uv: FULL_UV }));
}

/** Per-instance attributes (`aStage`, `aStage2`, `aStageUv`) and instance colors. */
export function stageAttributes(list: readonly StageInstance[]): { aStage: Float32Array; aStage2: Float32Array; aStageUv: Float32Array; color: Float32Array } {
  return {
    aStage: new Float32Array(list.flatMap((i) => i.stage)),
    aStage2: new Float32Array(list.flatMap((i) => i.stage2)),
    aStageUv: new Float32Array(list.flatMap((i) => i.uv)),
    color: new Float32Array(list.flatMap((i) => i.color)),
  };
}
