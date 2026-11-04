import type { BatchedLabel } from "../../../fx/labelProps";
import type { ExperienceData, GpuTier } from "../../../types";
import { resultBars, winTokens } from "@/content/hallBars";
import { HALL_ROWS, RESULT_ROWS, RESULT_Y, ROLE, type HallFonts, type HallLabels } from "../hallContent";
import { ABOUT, aboutFace, ARCH, contactBeacon, experienceArch, MONOLITH, monoliths, NOW_ARCH, nowArch, onFace, SHOT, winsFace } from "../hallGallery";
import { HALL_LAYOUT, type HallStation } from "../hallLayout";
import { experienceRows, type HighlightStation } from "../stations";
import { accentOf, caseFrame, stationNo, tint, type PremiumInstance } from "./caseFrame";
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
        const col = arch.columns[i];
        add(M.pane, onFace(arch.face, col.u, NOW_ARCH.h / 2 + 0.2, 0.03), arch.face.yaw, col.w - 0.3, 3.9, 0.85, [0, 0, ORIENT.upright, 0.045]);
        const left = col.u - (col.w - 0.6) / 2;
        add(M.token, onFace(arch.face, left - 0.24, 4.86, 0.1), 0, 0.26, 0.26, 1, [0, 0, 0, 2], [0, 0, 0], tint("#34d399", 1.6, tier));
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

/** Every interior instance of the hall, by part: each station's case frame and its interior. */
export function premiumInstances(input: Input, tier: GpuTier): Record<HallPart, PremiumInstance[]> {
  const out: Record<HallPart, PremiumInstance[]> = { north: [], contact: [], south: [] };
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
