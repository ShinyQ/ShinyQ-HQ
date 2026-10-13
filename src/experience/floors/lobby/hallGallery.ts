import type { TallObstacle } from "../../camera/collision";
import type { SignSpec } from "../../fx/signLayout";
import type { GpuTier, Rect, Vec2 } from "../../types";
import type { Box } from "../roof/solids";
import { gatePillars, HALL, stationOf } from "./hallLayout";

/**
 * Highlights Hall gallery (spectacle round, docs/superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md
 * Part 2): every station gets its own shape inside its old footprint, so pads, doors, spurs and deep
 * links stay where they were. About me stands on a round holo pedestal with its four stat tiles in an
 * arc, the top projects on three monolith screens in a shallow arc, work experience on a lit arch,
 * contact beside a signal beacon. A gateway arch spans the lead road, a light fountain marks the plaza
 * center (light only: the rover drives through it) and fake spotlight cones and glow pools light the
 * stations (no real lights: a light changes the program of every lit material in the tower).
 * Pure: the scenery, the camera collision and the tests read the same numbers.
 */

/** A vertical face that reads toward `out`: `u` runs along `right` (the reader's right), `y` up. */
export interface Face {
  origin: Vec2;
  out: Vec2;
  right: Vec2;
  /** Label yaw that turns a text's +z toward `out` (`BatchedLabel.yaw`, `Box.yaw`). */
  yaw: number;
}

// `0 - v` keeps +0 where v is 0 (no -0 in yaws and vectors).
export function faceOf(origin: Vec2, out: Vec2): Face {
  return { origin: { x: origin.x, z: origin.z }, out: { x: out.x, z: out.z }, right: { x: out.z, z: 0 - out.x }, yaw: Math.atan2(out.x, out.z) };
}

/** A point on a face: `u` along it, height `y`, `d` in front of it. */
export function onFace(f: Face, u: number, y: number, d = 0): [number, number, number] {
  return [f.origin.x + f.right.x * u + f.out.x * d, y, f.origin.z + f.right.z * u + f.out.z * d];
}

/** Turns a face around the vertical axis by `a` (radians, positive turns +z toward +x). */
function turned(out: Vec2, a: number): Vec2 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: out.x * c + out.z * s, z: out.z * c - out.x * s };
}

/**
 * A shallow arc of faces centered on `origin` (u = 0 on the face plane), curving toward the viewer:
 * the face at `u` sits `R (1 - cos t)` in front and turns by `t = asin(u / R)` toward the arc center.
 */
export function arcFace(origin: Face, u: number, radius: number): Face {
  const t = Math.asin(u / radius);
  const ahead = radius * (1 - Math.cos(t));
  const [x, , z] = onFace(origin, u, 0, ahead);
  return faceOf({ x, z }, turned(origin.out, -t));
}

// ---------------------------------------------------------------- 01 About me: holo pedestal

export const ABOUT = {
  center: { x: 37, z: -19.5 },
  base: { r: 1.5, h: 0.35 },
  column: { r: 0.75, h: 1.25 },
  /** The portrait hologram disc: center height and radius. */
  disc: { y: 3.55, r: 0.95 },
  /** Stat tiles: `u` along the face, center height, size, arc radius. */
  tiles: { u: [-4.75, -2.35, 2.35, 4.75], y: 3.45, w: 2.2, h: 1.7, arc: 8 },
  /** Eyebrow, name, headline and motto heights. */
  text: { eyebrow: 6.15, name: 5.55, headline: 5.05, motto: 1.2 },
} as const;

/** The pedestal's text face: through its center, reading toward the plaza. */
export function aboutFace(): Face {
  const s = stationOf("about");
  return faceOf(ABOUT.center, { x: -s.facing.x, z: -s.facing.z });
}

export interface StatTile {
  face: Face;
  y: number;
  w: number;
  h: number;
  /** Drift phase (radians). */
  phase: number;
}

export function statTiles(count: number = ABOUT.tiles.u.length): StatTile[] {
  const face = aboutFace();
  const T = ABOUT.tiles;
  return T.u.slice(0, count).map((u, i) => ({ face: arcFace(face, u, T.arc), y: T.y, w: T.w, h: T.h, phase: i * 1.7 }));
}

// ---------------------------------------------------------------- 02 Top projects: monoliths

export const MONOLITH = { u: [-5.4, 0, 5.4], w: 4.9, d: 0.5, h: 7.6, arc: 16, backZ: -20.4 } as const;
/** Screenshot on each monolith (16:10), and the text lines below it. */
export const SHOT = { y: 4.6, w: 4.4, h: 2.75 } as const;

export interface Monolith {
  face: Face;
  box: Box;
}

export function monoliths(count: number = MONOLITH.u.length): Monolith[] {
  const s = stationOf("projects");
  const out = { x: -s.facing.x, z: -s.facing.z };
  // The middle monolith's center line; the arc bends the outer two toward the plaza.
  const center = faceOf({ x: s.front.x, z: MONOLITH.backZ }, out);
  return MONOLITH.u.slice(0, count).map((u) => {
    const mid = arcFace(center, u, MONOLITH.arc);
    const face = faceOf({ x: mid.origin.x + (mid.out.x * MONOLITH.d) / 2, z: mid.origin.z + (mid.out.z * MONOLITH.d) / 2 }, mid.out);
    return { face, box: { x: mid.origin.x, z: mid.origin.z, y: 0, w: MONOLITH.w, d: MONOLITH.d, h: MONOLITH.h, yaw: mid.yaw } };
  });
}

// ---------------------------------------------------------------- 03 Work experience: lit arch

export const ARCH = { pillar: { from: 1.8, to: 9 }, depth: 1, h: 6.2, lintel: 1.2 } as const;

export interface ExperienceArch {
  face: Face;
  pillars: Box[];
  lintel: Box;
  /** Text columns on the two pillars (`u` center and width), Employment then Freelance. */
  columns: { u: number; w: number }[];
  opening: { w: number; h: number };
}

export function experienceArch(): ExperienceArch {
  const s = stationOf("experience");
  const face = faceOf(s.front, { x: -s.facing.x, z: -s.facing.z });
  const half = ARCH.depth / 2;
  const at = (u: number) => onFace(face, u, 0, -half);
  const P = ARCH.pillar;
  const width = P.to - P.from;
  const along = Math.abs(face.right.x) > 0.5;
  const box = (u: number, w: number, y: number, h: number): Box => {
    const [x, , z] = at(u);
    return { x, z, y, w: along ? w : ARCH.depth, d: along ? ARCH.depth : w, h };
  };
  const mid = (P.from + P.to) / 2;
  return {
    face,
    pillars: [box(-mid, width, 0, ARCH.h), box(mid, width, 0, ARCH.h)],
    lintel: box(0, 2 * P.to, ARCH.h, ARCH.lintel),
    columns: [
      { u: -mid, w: width },
      { u: mid, w: width },
    ],
    opening: { w: 2 * P.from, h: ARCH.h },
  };
}

// ---------------------------------------------------------------- 04 Contact: signal beacon

export const BEACON = {
  u: 5.3,
  base: { w: 1.4, h: 0.4 },
  mast: { r: 0.22, top: 9 },
  head: { r: 0.4, h: 0.5 },
  bars: [
    { y: 3.5, w: 1.6 },
    { y: 5.8, w: 1.2 },
    { y: 7.8, w: 0.9 },
  ],
  card: { u: -1.3, w: 10, y: 1.4, h: 4.4, d: 0.15, z: 18.35 },
} as const;

export interface ContactBeacon {
  mast: Vec2;
  card: { face: Face; box: Box };
  /** Pulse ring sources: the beacon head (transmitting) and the mast foot. */
  pulses: { x: number; y: number; z: number; phase: number }[];
  top: number;
}

export function contactBeacon(): ContactBeacon {
  const s = stationOf("contact");
  const out = { x: -s.facing.x, z: -s.facing.z };
  const face = faceOf(s.front, out);
  const z = (s.rect.minZ + s.rect.maxZ) / 2;
  const [mx] = onFace(face, BEACON.u, 0);
  const C = BEACON.card;
  const [cx] = onFace(face, C.u, 0);
  const cardFace = faceOf({ x: cx, z: C.z - C.d / 2 }, out);
  const top = BEACON.mast.top + BEACON.head.h / 2;
  return {
    mast: { x: mx, z },
    card: { face: cardFace, box: { x: cx, z: C.z, y: C.y, w: C.w, d: C.d, h: C.h } },
    pulses: [
      { x: mx, y: top, z, phase: 0 },
      { x: mx, y: top, z, phase: 1 / 3 },
      { x: mx, y: top, z, phase: 2 / 3 },
      { x: mx, y: 0.05, z, phase: 0.15 },
      { x: mx, y: 0.05, z, phase: 0.65 },
    ],
    top,
  };
}

// ---------------------------------------------------------------- Gateway arch, fountain, lights

/** The opening under the gateway arch (between the pillars, below the lintel). */
export function gateOpening(): { x: number; minZ: number; maxZ: number; top: number } {
  const g = HALL.gate;
  return { x: g.x, minZ: g.north.maxZ, maxZ: g.south.minZ, top: g.h - g.lintel };
}

/** True when a step from `prev` to `next` crosses the gate line eastward (into the hall) inside the opening. */
export function gateCrossed(prev: Vec2, next: Vec2): boolean {
  const o = gateOpening();
  if (!(prev.x < o.x && next.x >= o.x)) return false;
  const t = (o.x - prev.x) / (next.x - prev.x);
  const z = prev.z + (next.z - prev.z) * t;
  return z > o.minZ && z < o.maxZ;
}

/** The floating "HIGHLIGHTS HALL" sign above the gateway arch's lintel (`FloatingSigns`, mono bold by default; `hall.hall` from messages). */
export function gateSign(text: string): SignSpec {
  const o = gateOpening();
  return { text: text.toUpperCase(), x: HALL.gate.x, y: HALL.gate.signY, z: (o.minZ + o.maxZ) / 2, color: HALL.tone.about, fontSize: 0.75, letterSpacing: 0.08 };
}

export const FOUNTAIN = { x: 46, z: 3, ring: 2.2, rings: [1.6, 2.6], beams: { full: 12, lite: 6 }, spin: 0.15 } as const;

/** Light colors (the station tones, HALL.tone, plus the fountain cyan). */
const CYAN = "#22d3ee";

export interface LightInstance {
  /** `beam`: open cone fading up (uplights, fountain); `cone`: spotlight from above, brightest at its apex; `pool`: glow disc on the floor. */
  kind: "beam" | "cone" | "pool";
  x: number;
  y: number;
  z: number;
  h: number;
  /** Radius at the bottom and the top (pools: the outer radius, then 0). */
  r0: number;
  r1: number;
  color: string;
  alpha: number;
  /** 1 for fountain beams: they turn around the fountain and pulse in height. */
  spin: 0 | 1;
  phase: number;
}

const beam = (x: number, z: number, h: number, r0: number, r1: number, color: string, alpha: number, y = 0): LightInstance => ({ kind: "beam", x, y, z, h, r0, r1, color, alpha, spin: 0, phase: 0 });
const cone = (x: number, z: number, h: number, r0: number, color: string, alpha: number): LightInstance => ({ kind: "cone", x, y: 0, z, h, r0, r1: 0.25, color, alpha, spin: 0, phase: 0 });
const pool = (x: number, z: number, r: number, color: string, alpha: number): LightInstance => ({ kind: "pool", x, y: 0.025, z, h: 0, r0: r, r1: 0, color, alpha, spin: 0, phase: 0 });

/** Every spotlight cone, uplight, fountain beam and glow pool of the hall (one instanced draw call). Lite gets fewer fountain beams. */
export function hallLights(tier: GpuTier, projectCount: number = 3): LightInstance[] {
  const T = HALL.tone;
  const out: LightInstance[] = [];
  // About me: spotlight, floor pool and the projector beam from the column up to the portrait.
  const a = ABOUT.center;
  out.push(cone(a.x, a.z, 12, 3, T.about, 0.1), pool(a.x, a.z + 0.2, 3.4, T.about, 0.35));
  out.push(beam(a.x, a.z, ABOUT.disc.y - ABOUT.disc.r - (ABOUT.base.h + ABOUT.column.h), 0.5, 0.95, T.about, 0.22, ABOUT.base.h + ABOUT.column.h));
  // Top projects: an uplight fan and a pool in front of each monolith, one wide spotlight.
  for (const m of monoliths(projectCount)) {
    const [ux, , uz] = onFace(m.face, 0, 0, 0.4);
    const [px, , pz] = onFace(m.face, 0, 0, 1.0);
    out.push(beam(ux, uz, 3.2, 0.25, 1.8, T.projects, 0.18), pool(px, pz, 2.6, T.projects, 0.3));
  }
  const p = stationOf("projects");
  out.push(cone(p.front.x, (p.rect.minZ + p.rect.maxZ) / 2, 12, 5, T.projects, 0.07));
  // Work experience: a spotlight through the arch, a pool under it and uplights at both pillars.
  const arch = experienceArch();
  const [ex, , ez] = onFace(arch.face, 0, 0, 0.6);
  out.push(cone(ex, ez, 11, 2.6, T.experience, 0.1), pool(ex - 0.4, ez, 3.2, T.experience, 0.32));
  for (const c of arch.columns) {
    const [bx, , bz] = onFace(arch.face, c.u, 0, 0.3);
    out.push(beam(bx, bz, 3, 0.3, 2.2, T.experience, 0.14));
  }
  // Contact: a spotlight on the card, pools under the card and the mast.
  const b = contactBeacon();
  const [cx, , cz] = onFace(b.card.face, 0, 0, 0.4);
  out.push(cone(cx, cz, 11, 3.4, T.contact, 0.09), pool(cx, cz, 3.6, T.contact, 0.3), pool(b.mast.x, b.mast.z, 1.6, T.contact, 0.4));
  // Light fountain: turning beams on a floor ring, a core beam and a pool.
  const n = FOUNTAIN.beams[tier === "full" ? "full" : "lite"];
  const tones = [CYAN, T.about, T.projects];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push({ kind: "beam", x: FOUNTAIN.x + Math.sin(t) * FOUNTAIN.ring, y: 0, z: FOUNTAIN.z + Math.cos(t) * FOUNTAIN.ring, h: i % 2 ? 4.2 : 6, r0: 0.14, r1: 0.05, color: tones[i % tones.length], alpha: 0.55, spin: 1, phase: i / n });
  }
  out.push(beam(FOUNTAIN.x, FOUNTAIN.z, 8, 0.35, 0.15, CYAN, 0.35), pool(FOUNTAIN.x, FOUNTAIN.z, 3.6, CYAN, 0.35));
  // Gateway arch: uplights on the inner faces of both pillars.
  const o = gateOpening();
  out.push(beam(o.x, o.minZ + 0.4, HALL.gate.h - 0.4, 0.2, 0.6, T.about, 0.2), beam(o.x, o.maxZ - 0.4, HALL.gate.h - 0.4, 0.2, 0.6, T.about, 0.2));
  return out;
}

const pad = 0.1;
const rectOfBox = (b: Box): Rect => {
  const c = Math.abs(Math.cos(b.yaw ?? 0));
  const s = Math.abs(Math.sin(b.yaw ?? 0));
  const hx = (b.w * c + b.d * s) / 2 + pad;
  const hz = (b.w * s + b.d * c) / 2 + pad;
  return { minX: b.x - hx, maxX: b.x + hx, minZ: b.z - hz, maxZ: b.z + hz };
};

/** Gallery shapes taller than the default camera clearance, for the camera collision (`TALL` in CameraDirector). */
export function hallTall(projectCount: number = 3): TallObstacle[] {
  const g = HALL.gate;
  const arch = experienceArch();
  const b = contactBeacon();
  const half = BEACON.base.w / 2;
  return [
    ...gatePillars().map((r) => ({ ...r, h: g.h })),
    ...monoliths(projectCount).map((m) => ({ ...rectOfBox(m.box), h: MONOLITH.h })),
    ...arch.pillars.map((p) => ({ ...rectOfBox(p), h: ARCH.h + ARCH.lintel })),
    { minX: b.mast.x - half, maxX: b.mast.x + half, minZ: b.mast.z - half, maxZ: b.mast.z + half, h: b.top + 0.3 },
    { ...rectOfBox(b.card.box), h: BEACON.card.y + BEACON.card.h },
  ];
}
