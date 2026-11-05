import type { BatchedLabel } from "../../../fx/labelProps";
import type { ExperienceData, GpuTier } from "../../../types";
import { resultBars, winTokens } from "@/content/hallBars";
import { HALL_ROWS, HEADER, RESULT_ROWS, RESULT_Y, ROLE, SHOT_CELL, type HallFonts, type HallLabels } from "../hallContent";
import { ABOUT, aboutFace, ARCH, BEACON, contactBeacon, experienceArch, gateOpening, MONOLITH, monoliths, NOW_CARD, nowArch, nowCard, onFace, SHOT, winsFace } from "../hallGallery";
import { HALL, HALL_LAYOUT, type HallStation } from "../hallLayout";
import { ribLines } from "../hallStage";
import { experienceRows, type HighlightStation } from "../stations";
import { ACCENT, accentOf, caseFrame, stationNo, tint, type PremiumInstance } from "./caseFrame";
import { ORIENT, PREMIUM_MODE as M } from "./shader";

export type HallPart = "north" | "contact" | "south";
/** Which hall part (`HallView`) each station's interior draws in. */
export const PART_OF: Record<HighlightStation, HallPart> = { about: "north", projects: "north", experience: "north", wins: "north", now: "south", results: "south", contact: "contact" };

type Input = Pick<ExperienceData, "stats" | "career" | "highlights">;

const TIER_TINT = { gold: "#fbbf24", silver: "#e5e7eb", bronze: "#d97706", honor: "#a78bfa" } as const;
/** Wins orbits: radius, tilt (rad) and spin (rad/s) per ring (gold inside). */
const ORBIT = [
  { r: 1.3, tilt: 0.21, spin: 0.2 },
  { r: 1.7, tilt: -0.31, spin: 0.15 },
  { r: 2.1, tilt: 0.45, spin: 0.12 },
] as const;
/** A win star's size (u) at `WinToken.size` 1. */
const TOKEN = 0.34;
/** The trophy drawn in light on the wins pedestal: its quad (the cup's lip 0.6 u over its centre, the foot at the bottom). */
const TROPHY = { y: 3.3, w: 3.6, h: 3.4 } as const;
/** Width kept for the now terminals' live badge (its text and dot). */
const LIVE_W = 0.62;
/** Result bars: the longest bar's length, the before and after lines under a result's label, their thickness. */
const BAR = { len: 3.6, before: 0.8, after: 0.88, h: 0.05 } as const;

/** Bar lengths of a result, proportional within it (log over three decades past 20x). */
export function barLengths(bars: NonNullable<ReturnType<typeof resultBars>>, len: number = BAR.len): [number, number] {
  const top = Math.max(bars.before, bars.after);
  const at = (v: number) => (bars.scale === "log" ? Math.max(0.04, 1 + Math.log10(Math.max(v, 1e-9) / top) / 3) : v / top);
  return [Math.max(0.02, at(bars.before)) * len, Math.max(0.02, at(bars.after)) * len];
}

/** A point-sampled grid for the particle portrait: `n` x `n` cells inside the unit disc. */
function discGrid(n: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
    const x = ((i + 0.5) / n) * 2 - 1;
    const y = ((k + 0.5) / n) * 2 - 1;
    if (x * x + y * y <= 1) out.push({ x, y });
  }
  return out;
}

/** A deterministic 0..1 sequence (Park-Miller), so scatter offsets repeat on every load. */
function sequence(seed: number): () => number {
  let v = seed;
  return () => (v = (v * 16807) % 2147483647) / 2147483647;
}

/** Where the hall's screenshot atlas puts each cell (`hallAtlas` in hallContent.ts): the shots, then the portrait. */
function atlasCells(projects: number, tier: GpuTier) {
  const cell = SHOT_CELL[tier === "full" ? "full" : "lite"];
  const width = projects * cell.w + cell.h;
  return { shot: cell.w / width, portrait: [(projects * cell.w) / width, 1] as const };
}

/** Every interior instance of one station (beyond its case frame): the WOW exhibits (owner, 2026-11-04). */
function interior(s: HallStation, input: Input, tier: GpuTier): PremiumInstance[] {
  const full = tier === "full";
  const no = stationNo(s);
  const accent = accentOf(s);
  const glow = tint(accent, 1.3, tier);
  const out: PremiumInstance[] = [];
  const add = (mode: number, at: [number, number, number], yaw: number, w: number, h: number, alpha: number, c: PremiumInstance["c"] = [0, 0, ORIENT.upright, 0], b: [number, number, number] = [0, 0, 0], color = glow, d?: PremiumInstance["d"]) =>
    out.push({ at, yaw, color, a: [mode, w, h, no], b: [...b, alpha], c, d });
  const rand = sequence(97 + no * 131);
  // Shared revamp: a light underline under the header title, growing with the wake, and a dashed ring turning around the door pad.
  add(M.bar, [s.front.x, HALL.height[s.station] + HEADER.over + 0.16, s.front.z], s.yaw, 3.2, 0.035, 0.9, [0.25, 0, ORIENT.upright, 0]);
  add(M.ring, [s.pad.x, 0.06, s.pad.z], 0, 3.9, 3.9, 0.7, [0.03, 0, ORIENT.lying, -1], [0, full ? 0.25 : 0, 0]);
  switch (s.station) {
    case "about": {
      // The portrait as a particle hologram sampled from its photo, assembling on wake, inside a slow gyroscope; light chips orbit it.
      const f = aboutFace();
      const at = onFace(f, 0, ABOUT.disc.y, 0.02);
      const [u0, u1] = atlasCells(input.highlights.projects.length, tier).portrait;
      // 22 a side on full (372 particles): the L2 to L1 ride's triangle peak stays at main's.
      for (const p of discGrid(full ? 22 : 16)) {
        const pos = onFace(f, p.x * ABOUT.disc.r, ABOUT.disc.y + p.y * ABOUT.disc.r, 0.02);
        const scatter: [number, number, number] = [(rand() - 0.5) * 3.2, (rand() - 0.5) * 2.4, (rand() - 0.2) * 1.6];
        add(M.particle, pos, 0, full ? 0.12 : 0.15, 0, 0.95, [u0 + ((p.x + 1) / 2) * (u1 - u0), (p.y + 1) / 2, 0, 0], [0, 0, 0], [1, 1, 1], [...scatter, 0]);
      }
      add(M.ring, at, f.yaw, 2.7, 2.7, 0.95, [0, 0, ORIENT.upright, 0], [0.35, full ? 0.15 : 0, 0]);
      add(M.ring, at, f.yaw, 3.15, 3.15, 0.75, [0, 0, ORIENT.upright, 0], [-0.5, full ? -0.12 : 0, 1.6], tint(ACCENT.violet, 1.3, tier));
      for (let k = 0; k < 4; k++) add(M.token, at, f.yaw, 0.2, 0.2, 0.95, [0, 0, 1.75, 3], [0.3, full ? 0.3 : 0, (k / 4) * Math.PI * 2]);
      break;
    }
    case "projects": {
      // Floating screens fanned out in depth, cycling the three screenshots, floating forward on wake, each traced in light.
      const n = Math.min(MONOLITH.u.length, input.highlights.projects.length);
      const { shot } = atlasCells(input.highlights.projects.length, tier);
      monoliths(n).forEach((m, i) => {
        const push = 0.45 + 0.25 * Math.abs(i - (n - 1) / 2);
        add(M.screen, onFace(m.face, 0, SHOT.y, 0.07), m.face.yaw, SHOT.w, SHOT.h, 1, [0, push, ORIENT.upright, 0], [0, 0, 0], [1, 1, 1], [0, shot, input.highlights.projects.length, i]);
        add(M.shimmer, onFace(m.face, 0, SHOT.y, 0.08), m.face.yaw, SHOT.w + 0.14, SHOT.h + 0.14, 0.95, [0, push, ORIENT.upright, 0]);
      });
      break;
    }
    case "experience": {
      // A light elevator: the roles stacked as glowing floors in the opening (oldest at the bottom), a cursor rising to now on wake.
      const arch = experienceArch();
      const f = arch.face;
      const d = -ARCH.depth / 2 + 0.05;
      add(M.curtain, onFace(f, 0, ARCH.h / 2, -ARCH.depth / 2), f.yaw, arch.opening.w, ARCH.h, 0.75);
      const rows = experienceRows(input.career);
      const floors = Math.min(9, rows.employment.length + rows.freelance.length);
      const y0 = 0.7;
      const y1 = ARCH.h - 0.7;
      for (let i = 0; i < floors; i++) add(M.bar, onFace(f, 0, y0 + ((y1 - y0) * i) / Math.max(floors - 1, 1), d), f.yaw, arch.opening.w - 0.5, 0.06, 0.85, [0.15, 0, ORIENT.upright, 0], [0, 0, 0], tint(i % 2 ? ACCENT.violet : ACCENT.cyan, 1.3, tier));
      add(M.path, onFace(f, 0, (y0 + y1) / 2, d), 0, 0.06, y1 - y0, 0.6, [0, 0, ORIENT.column, 0.3]);
      add(M.particle, onFace(f, 0, y1, d + 0.05), 0, 0.42, 0, 1, [0, 0, 0, 0], [0, 0, 0], tint("#e0fbff", 1.6, tier), [0, y0 - y1, 0, 0]);
      [rows.employment, rows.freelance].forEach((list, c) => {
        const col = arch.columns[c];
        list.slice(0, HALL_ROWS).forEach((_, i) => add(M.bar, onFace(f, col.u, ROLE.top - i * ROLE.step - 0.44, 0.06), f.yaw, col.w - 1.2, BAR.h * 0.6, 0.8, [full ? 0.05 : 0, 0, ORIENT.upright, 0]));
      });
      break;
    }
    case "wins": {
      // A trophy drawn in light, the awards and honors as stars orbiting it by tier; first places flare.
      const f = winsFace();
      add(M.trophy, onFace(f, 0, TROPHY.y, 0.05), f.yaw, TROPHY.w, TROPHY.h, 0.9, [0, 0, ORIENT.upright, 0], [0, 0, 0], tint(TIER_TINT.gold, 1.3, tier));
      const at = onFace(f, 0, ABOUT.disc.y, 0);
      for (const t of winTokens(input.highlights.wins.tiers)) {
        const o = ORBIT[t.ring];
        add(M.token, at, f.yaw, TOKEN * t.size, TOKEN * t.size, 0.95, [0, 0, o.r, t.tier === "gold" ? 1 : 3], [o.tilt, full ? o.spin : 0, t.angle], tint(TIER_TINT[t.tier], 1.5, tier));
      }
      break;
    }
    case "now": {
      // Two live terminals: scanlined cards with a title bar and a pulsing live dot; the role types itself in on wake.
      const arch = nowArch();
      input.highlights.now.slice(0, arch.columns.length).forEach((_, i) => {
        const card = nowCard(arch.columns[i]);
        add(M.pane, onFace(arch.face, card.u, card.y, 0.03), arch.face.yaw, card.w, card.h, 0.85, [0, 0, ORIENT.upright, 0.06]);
        add(M.bar, onFace(arch.face, card.u, NOW_CARD.top - 0.5, 0.05), arch.face.yaw, card.w - 0.2, 0.03, 0.7, [0, 0, ORIENT.upright, 0]);
        add(M.token, onFace(arch.face, card.right - LIVE_W - 0.12, 4.78, 0.1), 0, 0.22, 0.22, 1, [0, 0, 0, 2], [0, 0, 0], tint("#34d399", 1.6, tier));
      });
      break;
    }
    case "results": {
      // The metric reactor: each verified number morphs from before to after (`morphFrames`) as its bar collapses to scale.
      const R = input.highlights.results;
      monoliths(Math.min(MONOLITH.u.length, Math.ceil(R.length / RESULT_ROWS)), "results").forEach((m, i) =>
        R.slice(i * RESULT_ROWS, (i + 1) * RESULT_ROWS).forEach((r, k) => {
          const bars = resultBars(r.value);
          if (!bars) return;
          const [lb, la] = barLengths(bars);
          const y = RESULT_Y[k];
          const u0 = -BAR.len / 2;
          add(M.bar, onFace(m.face, u0 + lb / 2, y - BAR.before, 0.06), m.face.yaw, lb, BAR.h, 0.25);
          add(M.bar, onFace(m.face, u0 + la / 2, y - BAR.after, 0.06), m.face.yaw, la, BAR.h, 1, [full ? lb / la : 0, 0, ORIENT.upright, 0]);
          add(M.ring, onFace(m.face, u0 - 0.25, y - 0.84, 0.06), m.face.yaw, 0.32, 0.32, 0.9, [0.2, full ? 0.6 : 0, ORIENT.upright, 0], [0, 0, k / 3]);
        }),
      );
      break;
    }
    case "contact": {
      // A portal ring that opens on arrival around the email card, its glow behind it; signal rings ripple across the floor.
      const b = contactBeacon();
      const C = BEACON.card;
      const mid = onFace(b.card.face, 0, C.y + C.h / 2, -0.12);
      add(M.pool, mid, b.card.face.yaw, C.w, C.h + 0.8, 0.28, [0, 0, ORIENT.upright, 0], [0, 0, 0], glow, [0, 0, 0, 1]);
      add(M.ring, mid, b.card.face.yaw, C.w + 1.2, C.h + 1.6, 0.95, [0.025, 0, ORIENT.upright, 0], [0, 0, 0], glow, [0, 0, 0, 1]);
      add(M.ring, mid, b.card.face.yaw, C.w + 1.8, C.h + 2.2, 0.55, [0.02, 0, ORIENT.upright, -1], [0, 0, 0], tint(ACCENT.violet, 1.2, tier), [0, 0, 0, 1]);
      for (const phase of [0, 1 / 3, 2 / 3]) add(M.ring, [b.mast.x, 0.05, b.mast.z], 0, 12, 12, 0.5, [0, 0.22, ORIENT.lying, 0], [0, 0, phase]);
      break;
    }
  }
  return out;
}

/** The plaza's centrepieces (owner, 2026-11-04): where the fountains were, light only (the rover drives through), on the spine. */
export const CENTRE = {
  orbit: { y: 3.8, r: 2.2, band: 4.9, points: { full: 160, lite: 90 } },
  spire: { y0: 1.1, y1: 10, core: 0.22 },
  /** Jakarta on the globe: latitude, and the longitude its turn starts from. */
  jakarta: { lat: -6.2, lon: 1.2 },
} as const;

/** The centrepieces' floor-local centres: the middle of each half of the plaza, on the spine. */
export function centres(): { orbit: { x: number; z: number }; spire: { x: number; z: number } } {
  const P = HALL.plaza;
  const S = HALL.lead[0].z + 6;
  return { orbit: { x: P.x, z: (P.z - P.d / 2 + S) / 2 }, spire: { x: P.x, z: (S + P.z + P.d / 2) / 2 } };
}

/** The Signal Spire's rings, one per career year (oldest at the bottom): height, radius and brightness from that year's roles and wins. */
export function spireRings(years: Input["career"]["years"]): { year: number; y: number; r: number; alpha: number; count: number }[] {
  const n = years.length;
  const C = CENTRE.spire;
  return years.map((y, i) => {
    const count = y.entries.length + y.awards;
    return { year: y.year, y: C.y0 + ((C.y1 - C.y0) * i) / Math.max(n - 1, 1), r: 1.1 + 0.16 * Math.min(count, 10), alpha: i === n - 1 ? 1 : 0.32 + 0.05 * Math.min(count, 10), count };
  });
}

/**
 * The Impact Orbit (a turning point globe with Jakarta marked, light paths travelling out to the case studies' sectors, two
 * tilted orbits) and the Signal Spire (a ring per career year around a rising core, dots orbiting each ring by its roles
 * and wins, the current year on top and brightest). Static on lite, still under reduced motion.
 */
function centrepieces(input: Input, tier: GpuTier): Record<HallPart, PremiumInstance[]> {
  const out: Record<HallPart, PremiumInstance[]> = { north: [], contact: [], south: [] };
  const full = tier === "full";
  const put = (part: HallPart, mode: number, at: [number, number, number], yaw: number, w: number, h: number, hex: string, alpha: number, c: PremiumInstance["c"] = [0, 0, ORIENT.upright, 0], b: [number, number, number] = [0, 0, 0], k = 1.3) =>
    out[part].push({ at, yaw, color: tint(hex, k, tier), a: [mode, w, h, 0], b: [...b, alpha], c });
  const { orbit, spire } = centres();
  const O = CENTRE.orbit;
  const spin = full ? 0.08 : 0;
  // The globe: points on a sphere, each turning around the vertical on its latitude circle.
  const n = O.points[full ? "full" : "lite"];
  for (let i = 0; i < n; i++) {
    const lat = Math.asin(1 - (2 * (i + 0.5)) / n);
    put("north", M.token, [orbit.x, O.y + O.r * Math.sin(lat), orbit.z], 0, 0.1, 0.1, i % 3 ? ACCENT.cyan : ACCENT.violet, 0.75, [0, 0, O.r * Math.cos(lat), 0], [0, spin, i * 2.39996]);
  }
  const jl = (CENTRE.jakarta.lat * Math.PI) / 180;
  put("north", M.token, [orbit.x, O.y + O.r * Math.sin(jl), orbit.z], 0, 0.42, 0.42, "#e0fbff", 1, [0, 0, O.r * Math.cos(jl), 2], [0, spin, CENTRE.jakarta.lon], 1.6);
  put("north", M.ring, [orbit.x, O.y, orbit.z], 0, 2 * O.r + 0.2, 2 * O.r + 0.2, ACCENT.cyan, 0.6, [0.02, 0, ORIENT.lying, 0]);
  for (const [k, tilt] of [0.45, -0.35].entries()) {
    put("north", M.ring, [orbit.x, O.y, orbit.z], 0, 2 * O.r + 1.6 + k, 2 * O.r + 1.6 + k, k ? ACCENT.violet : ACCENT.cyan, 0.55, [0.012, 0, ORIENT.lying, -1], [tilt, full ? 0.1 : 0, 0]);
    for (let j = 0; j < 3; j++) put("north", M.token, [orbit.x, O.y, orbit.z], 0, 0.22, 0.22, k ? ACCENT.violet : ACCENT.cyan, 0.95, [0, 0, O.r + 0.8 + k / 2, 3], [tilt, full ? 0.25 - k * 0.45 : 0, (j / 3) * Math.PI * 2]);
  }
  // Light paths out to the sectors (static nodes, labelled in `premiumTexts`), a pulse travelling out on each.
  sectorNodes(input.highlights.sectors).forEach((node) => {
    const len = O.band - O.r;
    const mid = O.r + len / 2;
    put("north", M.path, [orbit.x + Math.sin(node.a) * mid, O.y + node.dy, orbit.z + Math.cos(node.a) * mid], node.a - Math.PI / 2, len, 0.07, ACCENT.cyan, 0.7, [0, 0, ORIENT.lying, node.a / 6.2832]);
    put("north", M.token, [orbit.x + Math.sin(node.a) * O.band, O.y + node.dy, orbit.z + Math.cos(node.a) * O.band], 0, 0.3, 0.3, ACCENT.violet, 1, [0, 0, 0, 2], [0, 0, 0]);
  });
  put("north", M.pool, [orbit.x, 0.07, orbit.z], 0, 9, 9, ACCENT.cyan, 0.3, [0, 0, ORIENT.lying, 0]);
  // The spire: a rising core, a ring per year with dots orbiting it.
  const C = CENTRE.spire;
  put("south", M.path, [spire.x, (C.y0 + C.y1) / 2 + 0.3, spire.z], 0, C.core, C.y1 - C.y0 + 1.4, ACCENT.cyan, 0.8, [0, 0, ORIENT.column, 0]);
  spireRings(input.career.years).forEach((ring, i, all) => {
    const top = i === all.length - 1;
    const hex = top ? "#e0fbff" : i % 2 ? ACCENT.violet : ACCENT.cyan;
    put("south", M.ring, [spire.x, ring.y, spire.z], 0, 2 * ring.r, 2 * ring.r, hex, ring.alpha, [0.06 / ring.r, 0, ORIENT.lying, 0.04], [0, 0, 0], top ? 1.6 : 1.3);
    for (let j = 0; j < Math.min(ring.count, 8); j++) put("south", M.token, [spire.x, ring.y, spire.z], 0, 0.16, 0.16, hex, 0.9, [0, 0, ring.r, 0], [0, full ? (i % 2 ? -0.2 : 0.2) : 0, (j / Math.min(ring.count, 8)) * Math.PI * 2 + i]);
  });
  put("south", M.pool, [spire.x, 0.07, spire.z], 0, 7, 7, ACCENT.violet, 0.3, [0, 0, ORIENT.lying, 0]);
  return out;
}

/**
 * One label per centrepiece text (owner bug, 2026-11-04: copies on four sides showed through each other, troika text being
 * double sided): each turns to the camera every frame around its anchor (`x`, `z`), and a year label slides to its ring's
 * near edge (`r`). `premiumTexts` writes them in this order; `HallPremium` finds their members by text and anchor.
 */
export interface Billboard {
  text: string;
  x: number;
  y: number;
  z: number;
  r: number;
  size: number;
  color: string;
  bold: boolean;
  maxWidth: number;
  spacing?: number;
  top?: boolean;
}

export function centreBillboards(input: Input, labels: Pick<HallLabels, "impactOrbit" | "signalSpire">): Billboard[] {
  const { orbit, spire } = centres();
  const O = CENTRE.orbit;
  const C = CENTRE.spire;
  const out: Billboard[] = [];
  const at = (c: { x: number; z: number }, y: number, r = 0) => ({ x: c.x, y, z: c.z, r });
  out.push({ text: labels.impactOrbit.toUpperCase(), ...at(orbit, O.y - O.r - 0.55), size: 0.26, color: "#8fb3c9", bold: false, maxWidth: 6, spacing: 0.3 });
  const stat = input.stats[0];
  if (stat) {
    out.push({ text: stat.value, ...at(orbit, O.y + O.r + 1.6), size: 0.7, color: "#eefbff", bold: true, maxWidth: 6 });
    out.push({ text: stat.label, ...at(orbit, O.y + O.r + 1.1), size: 0.2, color: "#c9d6e3", bold: false, maxWidth: 4, top: true });
  }
  for (const node of sectorNodes(input.highlights.sectors))
    out.push({ text: node.label, ...at({ x: orbit.x + Math.sin(node.a) * (O.band + 0.35), z: orbit.z + Math.cos(node.a) * (O.band + 0.35) }, O.y + node.dy), size: 0.24, color: "#d9ccff", bold: true, maxWidth: 3.2 });
  out.push({ text: labels.signalSpire.toUpperCase(), ...at(spire, C.y1 + 1.3), size: 0.26, color: "#8fb3c9", bold: false, maxWidth: 6, spacing: 0.3 });
  spireRings(input.career.years).forEach((ring, i, all) => {
    const top = i === all.length - 1;
    out.push({ text: String(ring.year), ...at(spire, ring.y + 0.12, ring.r + 0.08), size: top ? 0.3 : 0.22, color: top ? "#eefbff" : "#b9c6d6", bold: true, maxWidth: 1.6 });
  });
  return out;
}

/** The Impact Orbit's sector nodes: evenly around the globe, alternating between two heights under its equator (clear of the stat above). */
export function sectorNodes(sectors: readonly string[]): { label: string; a: number; dy: number }[] {
  return sectors.map((label, i) => ({ label, a: (i / Math.max(sectors.length, 1)) * Math.PI * 2 + 0.3, dy: i % 2 ? -0.55 : -1.1 }));
}

/** The floor's life (owner, 2026-11-04: "make the floor more alive"): inlay rings, the rib and gate glows. */
const FLOOR = { inlay: [3, 6, 9], line: 0.08, rib: { d: 0.45, alpha: 0.09 }, pool: { d: 5, alpha: 0.32 }, path: { w: 0.14, alpha: 0.7 } } as const;

/**
 * The hall floor, alive and quiet (B4): concentric inlay rings at the middle of each half of the plaza, a faint glow under
 * every ceiling rib and at the gate (all in the north part, which is in view whenever the plaza is), and per station a soft
 * light pool at its face and a thin light path from the spine to its door pad with a slow pulse, both brightening with
 * its wake. Lite keeps them still (no pulse).
 */
function floorLife(tier: GpuTier): Record<HallPart, PremiumInstance[]> {
  const out: Record<HallPart, PremiumInstance[]> = { north: [], contact: [], south: [] };
  const lie = (part: HallPart, mode: number, at: [number, number, number], yaw: number, w: number, h: number, hex: string, alpha: number, no = 0, c: [number, number, number, number] = [0, 0, ORIENT.lying, 0]) =>
    out[part].push({ at, yaw, color: tint(hex, 1.2, tier), a: [mode, w, h, no], b: [0, 0, 0, alpha], c });
  const P = HALL.plaza;
  const S = HALL.lead[0].z + 6;
  for (const z of [(P.z - P.d / 2 + S) / 2, (S + P.z + P.d / 2) / 2])
    FLOOR.inlay.forEach((r, i) => lie("north", M.ring, [P.x, 0.05, z], 0, 2 * r, 2 * r, i % 2 ? ACCENT.violet : ACCENT.cyan, 0.4 - i * 0.08, 0, [FLOOR.line / r, 0, ORIENT.lying, 0]));
  const west = HALL.partition.line + HALL.partition.thickness;
  const half = (HALL.zone.maxX - west) / 2;
  ribLines().forEach((z, i) => lie("north", M.bar, [west + half, 0.05, z], 0, 2 * half, FLOOR.rib.d, i % 2 ? ACCENT.violet : ACCENT.cyan, FLOOR.rib.alpha));
  const o = gateOpening();
  lie("north", M.pool, [o.x, 0.05, (o.minZ + o.maxZ) / 2], 0, 7, o.maxZ - o.minZ, ACCENT.cyan, 0.3);
  const top = P.z - P.d / 2 + 1;
  const bottom = P.z + P.d / 2 - 1;
  for (const s of HALL_LAYOUT.stations) {
    const no = stationNo(s);
    const hex = accentOf(s);
    const part = PART_OF[s.station];
    const across = Math.abs(s.right.x) > 0.5 ? s.width : FLOOR.pool.d;
    const deep = Math.abs(s.right.x) > 0.5 ? FLOOR.pool.d : s.width;
    lie(part, M.pool, [s.front.x, 0.06, s.front.z], 0, across * 0.9, deep * 0.9, hex, FLOOR.pool.alpha, no);
    const from = { x: P.x, z: Math.min(bottom, Math.max(top, s.pad.z)) };
    const dx = s.pad.x - from.x;
    const dz = s.pad.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len > 1) lie(part, M.path, [(from.x + s.pad.x) / 2, 0.055, (from.z + s.pad.z) / 2], Math.atan2(0 - dz, dx), len, FLOOR.path.w, hex, FLOOR.path.alpha, no, [0, 0, ORIENT.lying, no / 7]);
  }
  return out;
}

/** Every interior instance of the hall, by part: each station's case frame and its interior, and the floor's life. */
export function premiumInstances(input: Input, tier: GpuTier): Record<HallPart, PremiumInstance[]> {
  const out = floorLife(tier);
  const centre = centrepieces(input, tier);
  for (const part of ["north", "contact", "south"] as const) out[part].push(...centre[part]);
  for (const s of HALL_LAYOUT.stations) {
    const f = caseFrame(s, tier);
    out[PART_OF[s.station]].push(...f.panes, ...interior(s, input, tier));
  }
  return out;
}

/** Station text groups (`HallTexts.group`) the interiors replace with their own (none today: they add to the station texts). */
export const REPLACES: readonly string[] = [];

/** The interiors' texts (merged into the hall's text batches): each project's headline metric, the now terminals' live badges and the centrepieces' titles, numbers, sectors and years. */
export function premiumTexts(input: Input, labels: HallLabels, fonts: HallFonts): BatchedLabel[] {
  const out: BatchedLabel[] = [];
  const projects = input.highlights.projects;
  monoliths(Math.min(MONOLITH.u.length, projects.length)).forEach((m, i) => {
    const metric = input.highlights.results.find((r) => r.slug === projects[i].slug);
    if (metric) out.push({ text: metric.value, position: onFace(m.face, 0, 1.3, 0.08), yaw: m.face.yaw, font: fonts.sansBold, fontSize: 0.3, color: "#c4b5fd", textAlign: "center", maxWidth: SHOT.w });
  });
  const now = nowArch();
  input.highlights.now.slice(0, now.columns.length).forEach((_, i) => {
    const card = nowCard(now.columns[i]);
    out.push({ text: labels.live.toUpperCase(), position: onFace(now.face, card.right, 4.75, 0.08), yaw: now.face.yaw, font: fonts.sansBold, fontSize: 0.17, color: "#34d399", letterSpacing: 0.2, anchorX: "right", textAlign: "right", maxWidth: LIVE_W });
  });
  for (const b of centreBillboards(input, labels)) out.push({ text: b.text, position: [b.x + b.r, b.y, b.z], yaw: Math.PI / 2, font: b.bold ? fonts.sansBold : fonts.sans, fontSize: b.size, color: b.color, textAlign: "center", maxWidth: b.maxWidth, ...(b.spacing ? { letterSpacing: b.spacing } : {}), ...(b.top ? { anchorY: "top" as const, lineHeight: 1.2 } : {}) });
  return out;
}
