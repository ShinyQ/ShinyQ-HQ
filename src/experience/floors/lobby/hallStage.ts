import { Color } from "three";
import { neonColor } from "../../fx/materials";
import type { GpuTier, Vec2 } from "../../types";
import type { AtlasCell, ShotQuad } from "./hallContent";
import { ARCH, experienceArch, gateOpening, NOW_ARCH, nowArch, onFace, type LightInstance, type StatTile } from "./hallGallery";
import { HALL, HALL_LAYOUT, hallPartitions } from "./hallLayout";
import { ENCLOSURE } from "./hallSolids";
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
  runway: 11,
  packet: 12,
  mote: 13,
  wall: 14,
  floor: 15,
  halo: 16,
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

/** The pulse ring geometry's radii (`HallFx`'s lying ring); the shader scales it by 1 to 1 + growth. */
export const RING_INNER = 0.5;
export const RING_OUTER = 0.62;

/**
 * Pulse rings on the flat ring (0.45 cycles per second), each growing from `RING_OUTER` to `reach` (the shader scales the
 * ring by 1 to 1 + growth), so a ring never spreads past its station (`ContactBeacon.reach`).
 */
export function ringInstances(sources: readonly { x: number; y: number; z: number; phase: number }[], color: string, tier: GpuTier, reach: number): StageInstance[] {
  const c = rgb(neonColor(color, 1, tier));
  const growth = Math.max(0, reach / RING_OUTER - 1);
  return sources.map((p) => ({ at: [p.x, p.y, p.z], yaw: 0, color: c, stage: [STAGE_KIND.ring, growth, 0.45, 0], stage2: [0, 0, p.phase, 1], uv: FULL_UV }));
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
  rib: { step: 12, phase: 6, spring: ENCLOSURE.wall, rise: 3, width: 0.08, gain: 1, alpha: 0.6 },
  /** The runway: a narrow cyan line from west of the rings to the plaza's spine, and two light packets sliding in on it. */
  runway: { west: 8.4, width: 0.45, gain: 1, alpha: 0.7 },
  /** A fainter glow line down the plaza's long axis (the spine), split at the part line. */
  spine: { width: 0.3, gain: 0.8, alpha: 0.35 },
  packet: { count: 2, w: 1.6, d: 0.6, gain: 1.2, alpha: 0.9 },
  /** A faint indigo grid on the dark walls (`enclosureQuads`), a violet rail on top; the west glass: low tinted, then clear up to the wall top. */
  wall: { h: ENCLOSURE.wall, fill: 0, gain: 0.8, alpha: 0.32 },
  partition: { fill: 0.06, gain: 1.2, alpha: 0.8 },
  glass: { fill: 0.006, gain: 0.8, alpha: 0.22, cell: 3 },
  /** Door-pad halos: a ring on the floor around each station's pad, in its accent. */
  halo: { r: 1.5, width: 0.07, gain: 1.3, alpha: 0.75 },
  floor: { gain: 0.8, alpha: 0.18 },
  /** Light motes rising slowly through the hall (full tier only), from a fixed seed so captures repeat. */
  mote: { count: 280, top: 11, size: 0.12, color: "#c7f3ff", alpha: 0.5, seed: 0x5eed },
} as const;

const FLAT: [number, number, number, number] = [0, 0, 1, 1];

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

/** The hall's inner west edge (the wall line's east face, x 37): the ribs, walls, floor and motes start there. */
const WEST = HALL.partition.line + HALL.partition.thickness;

/**
 * Every B4 shell instance (one draw per base shape and hall part): the ceiling ribs, the gate rings, the runway and its
 * packets, glass walls on the slab edges and over the west partitions, the floor grid and (full tier) the motes. Each
 * instance stands inside one hall part (`HighlightsHall` splits them by position; walls and floors come split at the
 * part lines), so the parts keep hiding off view.
 */
export function hallShellInstances(tier: GpuTier): StageInstance[] {
  const out: StageInstance[] = [];
  const K = STAGE_KIND;
  const put = (tag: string, kind: number, at: [number, number, number], yaw: number, hex: string, gain: number, shape: [number, number, number], stage2: [number, number, number, number]) =>
    out.push({ at, yaw, color: rgb(neonColor(hex, gain, tier)), stage: [kind, ...shape], stage2, uv: FLAT, tag });
  const { minZ, maxZ, maxX } = HALL.zone;
  const S = LOBBY_SLAB.halfZ;
  const north = hallPartitions()[0];
  const R = SHELL.rib;
  ribLines().forEach((z, i) => put("rib", K.rib, [(WEST + maxX) / 2, R.spring, z], 0, i % 2 ? SHELL.violet : SHELL.cyan, R.gain, [(maxX - WEST) / 2, R.rise, R.width], [0, Math.PI, i, R.alpha]));
  // Runway: from `SHELL.runway.west` u west of the gateway arch to the spine (the plaza's long axis), on the lead road's line, and its packets.
  const fromX = HALL.gate.x - HALL.gate.depth / 2 - SHELL.runway.west;
  const len = HALL.plaza.x - fromX;
  const mid: [number, number, number] = [fromX + len / 2, 0.04, HALL.lead[0].z];
  const W = SHELL.runway;
  put("runway", K.runway, mid, 0, SHELL.cyan, W.gain, [len, W.width, 0], [0, 0, 0, W.alpha]);
  const P = SHELL.packet;
  for (let i = 0; i < P.count; i++) put("packet", K.packet, mid, 0, "#e0fbff", P.gain, [P.w, P.d, len - P.w], [0, 0, i / P.count, P.alpha]);
  // Walls: x along `right`, so a wall's plane faces across it; split at the part lines (z S, x 48).
  const wall = (tag: string, x0: number, z0: number, x1: number, z1: number, h: number, hex: string, look: { gain: number; alpha: number; fill: number }, y0 = 0, cell = 0) => {
    const w = Math.hypot(x1 - x0, z1 - z0);
    put(tag, K.wall, [(x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2], yawOfRight({ x: (x1 - x0) / w, z: (z1 - z0) / w }), hex, look.gain, [w, h, cell], [look.fill, 0, 0, look.alpha]);
  };
  const split = HALL.stations.contact.maxX + 1;
  const e = 0.05;
  const WL = SHELL.wall;
  for (const [x0, z0, x1, z1] of [
    [north.maxX, minZ + e, maxX, minZ + e],
    [maxX - e, minZ, maxX - e, S],
    [maxX - e, S, maxX - e, maxZ],
    [WEST, maxZ - e, split, maxZ - e],
    [split, maxZ - e, maxX, maxZ - e],
  ])
    wall("wall", x0, z0, x1, z1, WL.h, SHELL.indigo, WL);
  // The west side: low tinted glass with a lit violet rail (the partitions), then clear glass up to the wall top, so the
  // certification wall stays readable from the plaza (the north run, the south run in two parts).
  const ph = HALL.partition.height;
  const southRun = hallPartitions()[1];
  const x = (north.minX + north.maxX) / 2;
  const contactZ = HALL.stations.contact.minZ - 8;
  for (const [z0, z1] of [
    [north.minZ, north.maxZ],
    [southRun.minZ, contactZ],
    [contactZ, southRun.maxZ],
  ]) {
    wall("partition", x, z0, x, z1, ph, SHELL.violet, SHELL.partition);
    wall("glass", x, z0, x, z1, WL.h - ph, SHELL.violet, SHELL.glass, ph, SHELL.glass.cell);
  }
  // Door-pad halos (lying rings), in each station's accent.
  const H = SHELL.halo;
  for (const st of HALL_LAYOUT.stations) put("halo", K.halo, [st.pad.x, 0.045, st.pad.z], 0, HALL.tone[st.station], H.gain, [H.r, H.r, H.width], [0, Math.PI * 2, 0, H.alpha]);
  // The spine glow down the plaza's long axis and the floor grid, each split at S (the part line).
  const SP = SHELL.spine;
  const top = HALL.plaza.z - HALL.plaza.d / 2;
  const bottom = HALL.plaza.z + HALL.plaza.d / 2;
  for (const [z0, z1] of [
    [top, S],
    [S, bottom],
  ])
    put("spine", K.runway, [HALL.plaza.x, 0.035, (z0 + z1) / 2], Math.PI / 2, SHELL.cyan, SP.gain, [z1 - z0, SP.width, 0], [0, 0, 0, SP.alpha]);
  const F = SHELL.floor;
  for (const [x0, z0, z1] of [
    [WEST, minZ, S],
    [WEST, S, maxZ],
  ])
    put("floor", K.floor, [(x0 + maxX) / 2, 0.03, (z0 + z1) / 2], 0, SHELL.indigo, F.gain, [maxX - x0, z1 - z0, 0], [0, 0, 0, F.alpha]);
  if (tier !== "full") return out;
  // Motes inside the hall (east of the north partition north of S, east of the hall's west edge south of it), rising at
  // 0.4 of the preview's 0.2 to 0.7 u/s, from a fixed seed (a Park-Miller generator), so captures repeat.
  const M = SHELL.mote;
  let seed: number = M.seed;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const color = rgb(new Color(M.color));
  for (let i = 0; i < M.count; i++) {
    const z = minZ + 0.5 + rand() * (maxZ - minZ - 1);
    const x0 = WEST;
    out.push({ at: [x0 + 0.5 + rand() * (maxX - x0 - 1), 0, z], yaw: 0, color, stage: [K.mote, ((0.2 + rand() * 0.5) * 0.4) / M.top, M.top, M.size], stage2: [0, 0, rand(), M.alpha], uv: FLAT, tag: "mote" });
  }
  return out;
}
