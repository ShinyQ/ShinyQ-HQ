import type { TallObstacle } from "../../camera/collision";
import type { SignSpec } from "../../fx/signLayout";
import type { Rect, Vec2 } from "../../types";
import type { Box } from "../roof/solids";
import { gatePillars, HALL, stationOf, type HallStation } from "./hallLayout";
import { LOBBY_SLAB } from "./slab";
import type { HighlightStation } from "./stations";

/**
 * Highlights Hall gallery (spectacle round, docs/superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md
 * Part 2): every station gets its own shape inside its old footprint, so pads, doors, spurs and deep
 * links stay where they were. About me stands on a round holo pedestal with its four stat tiles in an
 * arc, the top projects on three monolith screens in a shallow arc, work experience on a lit arch,
 * contact beside a signal beacon. A gateway arch spans the lead road (the hall's only way in since 2026-11-04) and
 * fake spotlight cones and glow pools light the stations (no real lights: a light changes the program of every lit material in the tower).
 * Wins (a pedestal with tier tiles), now (a smaller lit arch) and results (monoliths) reuse those shapes (2026-11-02).
 * Pure: the scenery, the camera collision and the tests read the same numbers.
 */

/** How deep every station's footprint is, from its face to its slab edge (u). */
const STATION_DEPTH = 3;

/** A point `inset` u in from a station's slab edge, on the middle of its face (`along` u along the face's line). */
function fromEdge(s: HallStation, inset: number): Vec2 {
  return { x: s.front.x + s.facing.x * STATION_DEPTH - s.facing.x * inset, z: s.front.z + s.facing.z * STATION_DEPTH - s.facing.z * inset };
}

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
  /** Middle of the about station, 1.5 u in from the north slab edge. */
  center: { x: (HALL.stations.about.minX + HALL.stations.about.maxX) / 2, z: -LOBBY_SLAB.halfZ + 1.5 },
  base: { r: 1.5, h: 0.35 },
  column: { r: 0.75, h: 1.25 },
  /** The portrait hologram disc: center height and radius. */
  disc: { y: 3.55, r: 0.95 },
  /** Wins tiles: `u` along the face, center height, size, arc radius. */
  tiles: { u: [-4.75, -2.35, 2.35, 4.75], y: 3.45, w: 2.2, h: 1.7, arc: 8 },
  /** About me's stat tiles: two columns `u` either side of the portrait, two rows (2026-11-04: clear of the west wall). */
  grid: { u: 2.65, y: [4.12, 2.47], w: 2.2, h: 1.45, arc: 8 },
  /** Eyebrow, name, headline and motto heights. */
  text: { eyebrow: 6.15, name: 5.55, headline: 5.05, motto: 1.2 },
} as const;

/** A pedestal station's text face: through the pedestal's center, reading toward the plaza. */
export function pedestalFace(name: "about" | "wins"): Face {
  const s = stationOf(name);
  return faceOf(name === "about" ? ABOUT.center : fromEdge(s, 1.5), { x: -s.facing.x, z: -s.facing.z });
}

/** The About me pedestal's text face. */
export function aboutFace(): Face {
  return pedestalFace("about");
}

/** The wins pedestal's text face: the About me pedestal's shape on the east edge, its disc a ring around the placings count. */
export function winsFace(): Face {
  return pedestalFace("wins");
}

export interface StatTile {
  face: Face;
  y: number;
  w: number;
  h: number;
  /** Drift phase (radians). */
  phase: number;
  /** Neon rim color (the About me tiles take the hall's green). */
  tone?: string;
}

/** About me's stat tiles in reading order (top left, top right, bottom left, bottom right), turned gently toward the pedestal. */
export function statTiles(count: number = 4): StatTile[] {
  const G = ABOUT.grid;
  const face = aboutFace();
  return Array.from({ length: Math.min(count, 4) }, (_, i) => ({ face: arcFace(face, i % 2 ? G.u : -G.u, G.arc), y: G.y[i >> 1], w: G.w, h: G.h, phase: i * 1.7 }));
}

/** The wins tiles (one per placement tier, gold first), on the wins pedestal's arc; their drift starts out of step with About me's. */
export function winsTiles(count: number = ABOUT.tiles.u.length): StatTile[] {
  const T = ABOUT.tiles;
  const face = winsFace();
  return T.u.slice(0, count).map((u, i) => ({ face: arcFace(face, u, T.arc), y: T.y, w: T.w, h: T.h, phase: 0.9 + i * 1.7 }));
}

// ---------------------------------------------------------------- 02 Top projects: monoliths

/** `backZ`: the middle monolith's center line, 0.6 u in from the north slab edge. */
export const MONOLITH = { u: [-5.4, 0, 5.4], w: 4.9, d: 0.5, h: 7.6, arc: 16, backZ: -LOBBY_SLAB.halfZ + 0.6 } as const;
/** Screenshot on each monolith (16:10), and the text lines below it. */
export const SHOT = { y: 4.6, w: 4.4, h: 2.75 } as const;

export interface Monolith {
  face: Face;
  box: Box;
}

/** The monoliths of a monolith station (top projects, results), up to three in a shallow arc. */
export function monoliths(count: number = MONOLITH.u.length, name: "projects" | "results" = "projects"): Monolith[] {
  const s = stationOf(name);
  const out = { x: -s.facing.x, z: -s.facing.z };
  // The middle monolith's center line, 0.6 u in from the slab edge; the arc bends the outer two toward the plaza.
  const center = faceOf(name === "projects" ? { x: s.front.x, z: MONOLITH.backZ } : fromEdge(s, 0.6), out);
  return MONOLITH.u.slice(0, count).map((u) => {
    const mid = arcFace(center, u, MONOLITH.arc);
    const face = faceOf({ x: mid.origin.x + (mid.out.x * MONOLITH.d) / 2, z: mid.origin.z + (mid.out.z * MONOLITH.d) / 2 }, mid.out);
    return { face, box: { x: mid.origin.x, z: mid.origin.z, y: 0, w: MONOLITH.w, d: MONOLITH.d, h: MONOLITH.h, yaw: mid.yaw } };
  });
}

// ---------------------------------------------------------------- 03 Work experience: lit arch

export const ARCH = { pillar: { from: 1.8, to: 9 }, depth: 1, h: 6.2, lintel: 1.2 } as const;
/** The now station's arch: the same shape, smaller, one pillar per current role. */
export const NOW_ARCH = { pillar: { from: 1.6, to: 6.6 }, depth: 1, h: 5.4, lintel: 1 } as const;
type ArchShape = typeof ARCH | typeof NOW_ARCH;

export interface ExperienceArch {
  face: Face;
  pillars: Box[];
  lintel: Box;
  /** Text columns on the two pillars (`u` center and width), Employment then Freelance. */
  columns: { u: number; w: number }[];
  opening: { w: number; h: number };
}

function litArch(name: HighlightStation, A: ArchShape): ExperienceArch {
  const s = stationOf(name);
  const face = faceOf(s.front, { x: -s.facing.x, z: -s.facing.z });
  const half = A.depth / 2;
  const at = (u: number) => onFace(face, u, 0, -half);
  const P = A.pillar;
  const width = P.to - P.from;
  const along = Math.abs(face.right.x) > 0.5;
  const box = (u: number, w: number, y: number, h: number): Box => {
    const [x, , z] = at(u);
    return { x, z, y, w: along ? w : A.depth, d: along ? A.depth : w, h };
  };
  const mid = (P.from + P.to) / 2;
  return {
    face,
    pillars: [box(-mid, width, 0, A.h), box(mid, width, 0, A.h)],
    lintel: box(0, 2 * P.to, A.h, A.lintel),
    columns: [
      { u: -mid, w: width },
      { u: mid, w: width },
    ],
    opening: { w: 2 * P.from, h: A.h },
  };
}

export function experienceArch(): ExperienceArch {
  return litArch("experience", ARCH);
}

/** A now card on a pillar column (2026-11-04): the card 0.3 u inside the column each side, from `bottom` to `top`; the text `pad` inside it. */
export const NOW_CARD = { inset: 0.3, pad: 0.25, top: 5.05, bottom: 1.25 } as const;

export function nowCard(col: { u: number; w: number }): { u: number; w: number; y: number; h: number; left: number; text: number; right: number } {
  const w = col.w - 2 * NOW_CARD.inset;
  return { u: col.u, w, y: (NOW_CARD.top + NOW_CARD.bottom) / 2, h: NOW_CARD.top - NOW_CARD.bottom, left: col.u - w / 2 + NOW_CARD.pad, text: w - 2 * NOW_CARD.pad, right: col.u + w / 2 - NOW_CARD.pad };
}

/** The now station's lit arch: the employment role on the left pillar, the freelance one on the right. */
export function nowArch(): ExperienceArch {
  return litArch("now", NOW_ARCH);
}

// ---------------------------------------------------------------- 04 Contact: signal beacon

export const BEACON = {
  u: 3.6,
  base: { w: 1.4, h: 0.4 },
  mast: { r: 0.22, top: 9 },
  head: { r: 0.4, h: 0.5 },
  bars: [
    { y: 3.5, w: 1.6 },
    { y: 5.8, w: 1.2 },
    { y: 7.8, w: 0.9 },
  ],
  /** `inset`: the card's center, 2.65 u in from the slab edge behind the station. */
  card: { u: -1.5, w: 6.4, y: 1.4, h: 4.4, d: 0.15, inset: 2.65 },
  /** Kept clear between the signal's reach and the station's edge: more than the glass case's inset (`CASE.inset` 0.15). */
  signalMargin: 0.25,
} as const;

export interface ContactBeacon {
  mast: Vec2;
  card: { face: Face; box: Box };
  /** Pulse ring sources: the beacon head (transmitting) and the mast foot. */
  pulses: { x: number; y: number; z: number; phase: number }[];
  /**
   * How far the signal (the pulse rings, the floor ripples, the glow under the mast) may spread from the mast: to the
   * nearest edge of the station, less `BEACON.signalMargin`, so it stays inside the station's glass case, and so inside the
   * hall's glass west side and south wall (owner bug, 2026-11-13: the rings reached 2.3 u past both, the ripples 4.6 u).
   */
  reach: number;
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
  const cz = fromEdge(s, C.inset).z;
  const cardFace = faceOf({ x: cx, z: cz + (out.z * C.d) / 2 }, out);
  const top = BEACON.mast.top + BEACON.head.h / 2;
  const r = s.rect;
  const reach = Math.min(mx - r.minX, r.maxX - mx, z - r.minZ, r.maxZ - z) - BEACON.signalMargin;
  return {
    mast: { x: mx, z },
    card: { face: cardFace, box: { x: cx, z: cz, y: C.y, w: C.w, d: C.d, h: C.h } },
    pulses: [
      { x: mx, y: top, z, phase: 0 },
      { x: mx, y: top, z, phase: 1 / 3 },
      { x: mx, y: top, z, phase: 2 / 3 },
      { x: mx, y: 0.05, z, phase: 0.15 },
      { x: mx, y: 0.05, z, phase: 0.65 },
    ],
    reach,
    top,
  };
}

// ---------------------------------------------------------------- Gateway arch, lights

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

export interface LightInstance {
  /** `beam`: open cone fading up (uplights); `cone`: spotlight from above, brightest at its apex; `pool`: glow disc on the floor. */
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
  /** 1 turns the light around the stage centre (`uCenter`) and pulses its height; the hall has none since 2026-11-04. */
  spin: 0 | 1;
  phase: number;
}

const beam = (x: number, z: number, h: number, r0: number, r1: number, color: string, alpha: number, y = 0): LightInstance => ({ kind: "beam", x, y, z, h, r0, r1, color, alpha, spin: 0, phase: 0 });
const cone = (x: number, z: number, h: number, r0: number, color: string, alpha: number): LightInstance => ({ kind: "cone", x, y: 0, z, h, r0, r1: 0.25, color, alpha, spin: 0, phase: 0 });
const pool = (x: number, z: number, r: number, color: string, alpha: number): LightInstance => ({ kind: "pool", x, y: 0.025, z, h: 0, r0: r, r1: 0, color, alpha, spin: 0, phase: 0 });

/** Every spotlight cone, uplight and glow pool of the hall (one instanced draw call per part). */
export function hallLights(projectCount: number = 3, resultCount: number = 3): LightInstance[] {
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
  // Contact: a spotlight on the card, pools under the card and the mast (the mast's within the signal's reach).
  const b = contactBeacon();
  const [cx, , cz] = onFace(b.card.face, 0, 0, 0.4);
  out.push(cone(cx, cz, 11, 3.4, T.contact, 0.09), pool(cx, cz, 3.6, T.contact, 0.3), pool(b.mast.x, b.mast.z, Math.min(1.6, b.reach), T.contact, 0.4));
  // Wins: the About me lighting on its pedestal (a spotlight, a pool and the projector beam up to the ring).
  const w = winsFace().origin;
  out.push(cone(w.x, w.z, 12, 3, T.wins, 0.1), pool(w.x - 0.2, w.z, 3.4, T.wins, 0.35));
  out.push(beam(w.x, w.z, ABOUT.disc.y - ABOUT.disc.r - (ABOUT.base.h + ABOUT.column.h), 0.5, 0.95, T.wins, 0.22, ABOUT.base.h + ABOUT.column.h));
  // Now: the work experience lighting on the smaller arch.
  const now = nowArch();
  const [nx, , nz] = onFace(now.face, 0, 0, 0.6);
  out.push(cone(nx, nz, 10, 2.2, T.now, 0.09), pool(nx - 0.4, nz, 2.8, T.now, 0.28));
  for (const c of now.columns) {
    const [bx, , bz] = onFace(now.face, c.u, 0, 0.3);
    out.push(beam(bx, bz, 2.6, 0.3, 1.8, T.now, 0.12));
  }
  // Results: the top projects lighting on its monoliths.
  for (const m of monoliths(resultCount, "results")) {
    const [ux, , uz] = onFace(m.face, 0, 0, 0.4);
    const [px, , pz] = onFace(m.face, 0, 0, 1.0);
    out.push(beam(ux, uz, 3.2, 0.25, 1.8, T.results, 0.18), pool(px, pz, 2.6, T.results, 0.3));
  }
  const r = stationOf("results");
  out.push(cone(r.front.x, (r.rect.minZ + r.rect.maxZ) / 2, 12, 5, T.results, 0.07));
  // The gateway's opening stays clear: no uplight columns in it (owner, 2026-11-04).
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
export function hallTall(projectCount: number = 3, resultCount: number = 3): TallObstacle[] {
  const g = HALL.gate;
  const arch = experienceArch();
  const now = nowArch();
  const b = contactBeacon();
  const half = BEACON.base.w / 2;
  return [
    ...gatePillars().map((r) => ({ ...r, h: g.h })),
    ...monoliths(projectCount).map((m) => ({ ...rectOfBox(m.box), h: MONOLITH.h })),
    ...arch.pillars.map((p) => ({ ...rectOfBox(p), h: ARCH.h + ARCH.lintel })),
    ...now.pillars.map((p) => ({ ...rectOfBox(p), h: NOW_ARCH.h + NOW_ARCH.lintel })),
    ...monoliths(resultCount, "results").map((m) => ({ ...rectOfBox(m.box), h: MONOLITH.h })),
    { minX: b.mast.x - half, maxX: b.mast.x + half, minZ: b.mast.z - half, maxZ: b.mast.z + half, h: b.top + 0.3 },
    { ...rectOfBox(b.card.box), h: BEACON.card.y + BEACON.card.h },
  ];
}
