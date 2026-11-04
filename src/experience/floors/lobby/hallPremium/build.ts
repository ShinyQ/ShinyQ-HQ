import type { BatchedLabel } from "../../../fx/labelProps";
import type { ExperienceData, GpuTier } from "../../../types";
import { resultBars, winTokens } from "@/content/hallBars";
import { HALL_ROWS, RESULT_ROWS, RESULT_Y, ROLE, type HallFonts, type HallLabels } from "../hallContent";
import { ABOUT, aboutFace, ARCH, contactBeacon, gateOpening, experienceArch, MONOLITH, monoliths, nowArch, nowCard, onFace, SHOT, winsFace } from "../hallGallery";
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
/** A win token's size (u) at `WinToken.size` 1. */
const TOKEN = 0.3;
/** Result bars: the longest bar's length, the before and after lines under a result's label, their thickness. */
const BAR = { len: 3.6, before: 0.8, after: 0.88, h: 0.05 } as const;

/** Bar lengths of a result, proportional within it (log over three decades past 20x). */
export function barLengths(bars: NonNullable<ReturnType<typeof resultBars>>, len: number = BAR.len): [number, number] {
  const top = Math.max(bars.before, bars.after);
  const at = (v: number) => (bars.scale === "log" ? Math.max(0.04, 1 + Math.log10(Math.max(v, 1e-9) / top) / 3) : v / top);
  return [Math.max(0.02, at(bars.before)) * len, Math.max(0.02, at(bars.after)) * len];
}

/** Every interior instance of one station (beyond its case frame). */
function interior(s: HallStation, input: Input, tier: GpuTier): PremiumInstance[] {
  const full = tier === "full";
  const no = stationNo(s);
  const accent = accentOf(s);
  const glow = tint(accent, 1.3, tier);
  const out: PremiumInstance[] = [];
  const add = (mode: number, at: [number, number, number], yaw: number, w: number, h: number, alpha: number, c: PremiumInstance["c"] = [0, 0, ORIENT.upright, 0], b: [number, number, number] = [0, 0, 0], color = glow) =>
    out.push({ at, yaw, color, a: [mode, w, h, no], b: [...b, alpha], c });
  switch (s.station) {
    case "about": {
      // A slow two-ring gyroscope around the portrait.
      const f = aboutFace();
      const at = onFace(f, 0, ABOUT.disc.y, 0);
      add(M.ring, at, f.yaw, 2.7, 2.7, 0.95, [0, 0, ORIENT.upright, 0], [0.35, full ? 0.15 : 0, 0]);
      add(M.ring, at, f.yaw, 3.15, 3.15, 0.75, [0, 0, ORIENT.upright, 0], [-0.5, full ? -0.12 : 0, 1.6], tint("#a78bfa", 1.3, tier));
      break;
    }
    case "projects":
      // A soft scan shimmer and a light trace circling each screenshot.
      for (const m of monoliths(Math.min(MONOLITH.u.length, input.highlights.projects.length))) add(M.shimmer, onFace(m.face, 0, SHOT.y, 0.06), m.face.yaw, SHOT.w + 0.14, SHOT.h + 0.14, 0.95);
      break;
    case "experience": {
      // An inner light curtain in the opening, and a light bar under each role on the pillars (newest on top) that grows with the wake.
      const arch = experienceArch();
      const f = arch.face;
      add(M.curtain, onFace(f, 0, ARCH.h / 2, -ARCH.depth / 2), f.yaw, arch.opening.w, ARCH.h, 0.9);
      const rows = experienceRows(input.career);
      [rows.employment, rows.freelance].forEach((list, c) => {
        const col = arch.columns[c];
        const w = col.w - 0.6;
        list.slice(0, HALL_ROWS).forEach((_, i) => add(M.bar, onFace(f, col.u, ROLE.top - i * ROLE.step - 0.44, 0.06), f.yaw, w, BAR.h * 0.6, 0.8, [full ? 1 : 0, 0, ORIENT.upright, 0]));
      });
      break;
    }
    case "wins": {
      // The awards and honors as tokens orbiting in three tilted rings, first places larger in gold with a sweep.
      const f = winsFace();
      const at = onFace(f, 0, ABOUT.disc.y, 0);
      for (const t of winTokens(input.highlights.wins.tiers)) {
        const o = ORBIT[t.ring];
        add(M.token, at, f.yaw, TOKEN * t.size, TOKEN * t.size, 0.95, [0, 0, o.r, t.tier === "gold" ? 1 : 0], [o.tilt, full ? o.spin : 0, t.angle], tint(TIER_TINT[t.tier], 1.5, tier));
      }
      break;
    }
    case "now": {
      // A glass card per current role, each with a breathing "current" dot by its type.
      const arch = nowArch();
      input.highlights.now.slice(0, arch.columns.length).forEach((_, i) => {
        const card = nowCard(arch.columns[i]);
        add(M.pane, onFace(arch.face, card.u, card.y, 0.03), arch.face.yaw, card.w, card.h, 0.85, [0, 0, ORIENT.upright, 0.045]);
        add(M.token, onFace(arch.face, card.right - 0.12, 4.75, 0.1), 0, 0.24, 0.24, 1, [0, 0, 0, 2], [0, 0, 0], tint("#34d399", 1.6, tier));
      });
      break;
    }
    case "results": {
      // Per shown result: a faint before bar and a solid after bar that grows with the wake; a result that does not parse stays text only.
      const R = input.highlights.results;
      monoliths(Math.min(MONOLITH.u.length, Math.ceil(R.length / RESULT_ROWS)), "results").forEach((m, i) =>
        R.slice(i * RESULT_ROWS, (i + 1) * RESULT_ROWS).forEach((r, k) => {
          const bars = resultBars(r.value);
          if (!bars) return;
          const [lb, la] = barLengths(bars);
          const y = RESULT_Y[k];
          const u0 = -BAR.len / 2;
          add(M.bar, onFace(m.face, u0 + lb / 2, y - BAR.before, 0.06), m.face.yaw, lb, BAR.h, 0.32);
          add(M.bar, onFace(m.face, u0 + la / 2, y - BAR.after, 0.06), m.face.yaw, la, BAR.h, 1, [full ? 1 : 0, 0, ORIENT.upright, 0]);
        }),
      );
      break;
    }
    case "contact": {
      // Signal rings ripple across the floor from the beacon.
      const b = contactBeacon();
      for (const phase of [0, 1 / 3, 2 / 3]) add(M.ring, [b.mast.x, 0.05, b.mast.z], 0, 12, 12, 0.5, [0, 0.22, ORIENT.lying, 0], [0, 0, phase]);
      break;
    }
  }
  return out;
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
  const half = (HALL.zone.maxX - HALL.zone.minX - 1) / 2;
  ribLines().forEach((z, i) => lie("north", M.bar, [HALL.zone.minX + 1 + half, 0.05, z], 0, 2 * half, FLOOR.rib.d, i % 2 ? ACCENT.violet : ACCENT.cyan, FLOOR.rib.alpha));
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
  for (const s of HALL_LAYOUT.stations) {
    const f = caseFrame(s, tier);
    out[PART_OF[s.station]].push(...f.panes, ...interior(s, input, tier));
  }
  return out;
}

/** Station text groups (`HallTexts.group`) the interiors replace with their own (none today: they add to the station texts). */
export const REPLACES: readonly string[] = [];

/** The interiors' texts (merged into the hall's text batches): each project's headline metric. */
export function premiumTexts(input: Input, labels: HallLabels, fonts: HallFonts): BatchedLabel[] {
  void labels;
  const out: BatchedLabel[] = [];
  const projects = input.highlights.projects;
  monoliths(Math.min(MONOLITH.u.length, projects.length)).forEach((m, i) => {
    const metric = input.highlights.results.find((r) => r.slug === projects[i].slug);
    if (metric) out.push({ text: metric.value, position: onFace(m.face, 0, 1.3, 0.08), yaw: m.face.yaw, font: fonts.sansBold, fontSize: 0.3, color: "#c4b5fd", textAlign: "center", maxWidth: SHOT.w });
  });
  return out;
}
