import { Color } from "three";
import { neonColor } from "../../fx/materials";
import type { GpuTier, Vec2 } from "../../types";
import type { AtlasCell, ShotQuad } from "./hallContent";
import { ARCH, experienceArch, gateOpening, NOW_ARCH, nowArch, onFace, type LightInstance, type StatTile } from "./hallGallery";
import { HALL, hallPartitions } from "./hallLayout";
import { LOBBY_SLAB } from "./slab";

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
  /** B4 shell (owner decision 2026-11-04): ceiling ribs and gate rings are arc ribbons, the rest flat quads or dots. */
  rib: 9,
  gateRing: 10,
  runway: 11,
  packet: 12,
  mote: 13,
  wall: 14,
  floor: 15,
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
  /** What the instance is for (tests and part splits only; never uploaded). */
  tag?: string;
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

/** Both lit openings (work experience and now) in one draw. */
export function portalInstances(tier: GpuTier): StageInstance[] {
  const now = nowArch();
  return [
    portalInstance(tier),
    plane(STAGE_KIND.portal, onFace(now.face, 0, NOW_ARCH.h / 2, -NOW_ARCH.depth / 2), now.face.right, now.opening.w, now.opening.h, rgb(neonColor(HALL.tone.now, 1.2, tier)), tier === "full" ? 0.8 : 0.7),
  ];
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
    ...tiles.map((t) => plane(STAGE_KIND.tile, onFace(t.face, 0, t.y, 0), t.face.right, t.w, t.h, t.tone ? rgb(neonColor(t.tone, 1.4, tier)) : line, 1, t.phase)),
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

/**
 * The B4 "balanced" hall shell (owner decision 2026-11-04): what it spans and how bright each piece is. Glow concentrates on
 * the stations and the gate; ribs, runway, walls and the floor grid sit one step lower.
 */
export const SHELL = {
  cyan: "#6ee7ff",
  violet: "#a78bfa",
  indigo: "#6d4dff",
  /** Ceiling ribs: one every `step` u along the hall, springing from the wall tops (`spring`), rising `rise` u, `width` u wide. */
  rib: { step: 12, phase: 6, spring: 6, rise: 4.5, width: 0.12, gain: 1, alpha: 0.8 },
  /** The gate tunnel: three rings `gap` u apart west of the gateway arch, centred over the lead road. */
  ring: { count: 3, gap: 1.6, r: 4.3, y: 4.5, width: 0.18, gain: 1.4, alpha: 1 },
  /** The runway: a narrow cyan line from west of the rings to the plaza's spine, and two light packets sliding in on it. */
  runway: { west: 4, width: 0.45, gain: 1, alpha: 0.7 },
  packet: { count: 2, w: 1.6, d: 0.6, gain: 1.2, alpha: 0.9 },
  /** Glass walls on the north, east and south edges (indigo grid) and over the west partitions (violet, low). */
  wall: { h: 6, fill: 0.015, gain: 0.8, alpha: 0.45 },
  partition: { fill: 0.06, gain: 1.2, alpha: 0.8 },
  floor: { gain: 0.8, alpha: 0.18 },
  /** Light motes rising slowly through the hall (full tier only), from a fixed seed so captures repeat. */
  mote: { count: 280, top: 11, size: 0.12, color: "#c7f3ff", alpha: 0.5, seed: 0x5eed },
} as const;

const FLAT: [number, number, number, number] = [0, 0, 1, 1];

/** A deterministic 0..1 generator (mulberry32), so the motes stand in the same places on every load. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The ribs' z lines: one every `SHELL.rib.step` u inside the hall, phased to fall between the east stations' centres and off
 * the lead road (z 6 + 12k), so a station view never looks along a rib edge on.
 */
export function ribLines(): number[] {
  const { minZ, maxZ } = HALL.zone;
  const step = SHELL.rib.step;
  const first = SHELL.rib.phase + Math.ceil((minZ + 1 - SHELL.rib.phase) / step) * step;
  const out: number[] = [];
  for (let z = first; z <= maxZ - 1; z += step) out.push(z);
  return out;
}

/** The hall's inner west edge (x 33), where the ribs spring and the south partition stands. */
const WEST = HALL.zone.minX + 1;

/**
 * Every B4 shell instance (one draw per base shape and hall part): the ceiling ribs, the gate rings, the runway and its
 * packets, glass walls on the slab edges and over the west partitions, the floor grid and (full tier) the motes. Each
 * instance stands inside one hall part (`HighlightsHall` splits them by position; walls and floors come split at the
 * part lines), so the parts keep hiding off view.
 */
export function hallShellInstances(tier: GpuTier): StageInstance[] {
  const out: StageInstance[] = [];
  const tone = (hex: string, k: number) => rgb(neonColor(hex, k, tier));
  const R = SHELL.rib;
  const midX = (WEST + HALL.zone.maxX) / 2;
  const half = (HALL.zone.maxX - WEST) / 2;
  ribLines().forEach((z, i) =>
    out.push({ at: [midX, R.spring, z], yaw: 0, color: tone(i % 2 ? SHELL.violet : SHELL.cyan, R.gain), stage: [STAGE_KIND.rib, half, R.rise, R.width], stage2: [0, Math.PI, i, R.alpha], uv: FLAT, tag: "rib" }),
  );
  // Gate tunnel: rings face the lead road (their plane along z), cyan and violet alternating, pulsing in sequence.
  const o = gateOpening();
  const G = SHELL.ring;
  const gz = (o.minZ + o.maxZ) / 2;
  for (let i = 0; i < G.count; i++) {
    const x = HALL.gate.x - HALL.gate.depth / 2 - 0.6 - i * G.gap;
    out.push({ at: [x, G.y, gz], yaw: Math.PI / 2, color: tone(i % 2 ? SHELL.violet : SHELL.cyan, G.gain), stage: [STAGE_KIND.gateRing, G.r, G.r, G.width], stage2: [0, Math.PI * 2, i, G.alpha], uv: FLAT, tag: "gate-ring" });
  }
  // Runway: from west of the last ring to the spine (the plaza's long axis), on the lead road's line.
  const lead = HALL.lead[0].z;
  const fromX = HALL.gate.x - HALL.gate.depth / 2 - 0.6 - (G.count - 1) * G.gap - SHELL.runway.west;
  const toX = HALL.plaza.x;
  const len = toX - fromX;
  const W = SHELL.runway;
  out.push({ at: [(fromX + toX) / 2, 0.035, lead], yaw: 0, color: tone(SHELL.cyan, W.gain), stage: [STAGE_KIND.runway, len, W.width, 0], stage2: [0, 0, 0, W.alpha], uv: FLAT, tag: "runway" });
  const P = SHELL.packet;
  for (let i = 0; i < P.count; i++)
    out.push({ at: [(fromX + toX) / 2, 0.04, lead], yaw: 0, color: tone("#e0fbff", P.gain), stage: [STAGE_KIND.packet, P.w, P.d, len - P.w], stage2: [0, 0, i / P.count, P.alpha], uv: FLAT, tag: "packet" });
  // Glass walls: x along `right`, so a wall's plane faces across it. Split at the part lines (z S, x 48).
  const split = HALL.stations.contact.maxX + 1;
  const S = LOBBY_SLAB.halfZ;
  const WL = SHELL.wall;
  const wall = (x0: number, z0: number, x1: number, z1: number, h: number, hex: string, gain: number, alpha: number, fill: number, tag: string) => {
    const w = Math.hypot(x1 - x0, z1 - z0);
    const right = { x: (x1 - x0) / w, z: (z1 - z0) / w };
    out.push({ at: [(x0 + x1) / 2, h / 2, (z0 + z1) / 2], yaw: yawOfRight(right), color: tone(hex, gain), stage: [STAGE_KIND.wall, w, h, 0], stage2: [fill, 0, 0, alpha], uv: FLAT, tag });
  };
  const { minZ, maxZ, maxX } = HALL.zone;
  const inset = 0.05;
  const north = hallPartitions()[0];
  wall(north.maxX, minZ + inset, maxX, minZ + inset, WL.h, SHELL.indigo, WL.gain, WL.alpha, WL.fill, "wall");
  wall(maxX - inset, minZ, maxX - inset, S, WL.h, SHELL.indigo, WL.gain, WL.alpha, WL.fill, "wall");
  wall(maxX - inset, S, maxX - inset, maxZ, WL.h, SHELL.indigo, WL.gain, WL.alpha, WL.fill, "wall");
  wall(WEST, maxZ - inset, split, maxZ - inset, WL.h, SHELL.indigo, WL.gain, WL.alpha, WL.fill, "wall");
  wall(split, maxZ - inset, maxX, maxZ - inset, WL.h, SHELL.indigo, WL.gain, WL.alpha, WL.fill, "wall");
  // The west partitions: violet glass with a lit rail on top (the north run, the south run in two parts).
  const PT = SHELL.partition;
  const ph = HALL.partition.height;
  const southRun = hallPartitions()[2];
  const nx = (north.minX + north.maxX) / 2;
  const sx = (southRun.minX + southRun.maxX) / 2;
  const contactZ = HALL.stations.contact.minZ - 8;
  wall(nx, north.minZ, nx, north.maxZ, ph, SHELL.violet, PT.gain, PT.alpha, PT.fill, "partition");
  wall(sx, southRun.minZ, sx, contactZ, ph, SHELL.violet, PT.gain, PT.alpha, PT.fill, "partition");
  wall(sx, contactZ, sx, southRun.maxZ, ph, SHELL.violet, PT.gain, PT.alpha, PT.fill, "partition");
  // The floor grid, north and south of S (the part line).
  const F = SHELL.floor;
  const floor = (x0: number, z0: number, x1: number, z1: number) =>
    out.push({ at: [(x0 + x1) / 2, 0.015, (z0 + z1) / 2], yaw: 0, color: tone(SHELL.indigo, F.gain), stage: [STAGE_KIND.floor, x1 - x0, z1 - z0, 0], stage2: [0, 0, 0, F.alpha], uv: FLAT, tag: "floor" });
  floor(north.maxX, minZ, maxX, S);
  floor(WEST, S, maxX, maxZ);
  if (tier !== "full") return out;
  // Motes inside the hall (east of the north partition north of S, east of the hall's west edge south of it).
  const M = SHELL.mote;
  const rand = seeded(M.seed);
  const moteColor = rgb(new Color(M.color));
  for (let i = 0; i < M.count; i++) {
    const z = minZ + 0.5 + rand() * (maxZ - minZ - 1);
    const x0 = z < S ? north.maxX : WEST;
    const x = x0 + 0.5 + rand() * (maxX - x0 - 1);
    // 0.2 to 0.7 u/s in the preview, rising at 0.4 of it.
    const speed = (0.2 + rand() * 0.5) * 0.4;
    out.push({ at: [x, 0, z], yaw: 0, color: moteColor, stage: [STAGE_KIND.mote, speed / M.top, M.top, M.size], stage2: [0, 0, rand(), M.alpha], uv: FLAT, tag: "mote" });
  }
  return out;
}
