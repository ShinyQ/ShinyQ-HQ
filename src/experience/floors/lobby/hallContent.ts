import { CAREER_TONE } from "../../fx/holoIcons";
import type { BatchedLabel } from "../../fx/labelProps";
import type { ExperienceData, Vec2 } from "../../types";
import type { Box } from "../roof/solids";
import { podLiveLink } from "@/content/selectors";
import { HALL, stationOf, type HallStation } from "./hallLayout";
import { experienceRows, HIGHLIGHT_STAT_COUNT, type HighlightStation } from "./stations";

/**
 * Pure scenery data for the Highlights Hall: every solid in one merged mesh (plus its edges), every
 * text in one troika BatchedText, the three screenshots in one atlas quad mesh. Positions are
 * floor-local; panel coordinates are `u` along the face (the reader's right) and the height `y`.
 */

export interface HallLabels {
  about: string;
  projects: string;
  experience: string;
  contact: string;
  employment: string;
  freelance: string;
  /** "+{count} more in the drawer" */
  more: (count: number) => string;
  cvHint: string;
  /** Floor sign on the passage. */
  hall: string;
  /** "Visit live site" (`common.visitLive`, R4-J): tag under a project screenshot that has a live link. */
  visitLive: string;
  /** Station names for point-and-go (`hud.rooms.highlights*`). */
  stations: Record<HighlightStation, string>;
}

export interface HallFonts {
  sans: string;
  sansBold: string;
  mono: string;
  monoBold: string;
}

export type HallInput = Pick<ExperienceData, "profile" | "stats" | "roof" | "career" | "highlights" | "labs">;

/** Roles per experience column in 3D; the drawer lists every one. */
export const HALL_ROWS = 6;
const STAT_U = [-3.6, -1.2, 1.2, 3.6] as const;
const TILE = { y: 2.9, w: 2.2, h: 1.8 } as const;
const SHOT_U = [-5.2, 0, 5.2] as const;
/** Experience rows: the first org line and the step between rows (org plus role and period). */
const ROLE = { top: 4.45, step: 0.6 } as const;
export const SHOT = { y: 3.55, w: 4.6, h: 2.875 } as const;
/** Atlas cell per screenshot (16:10), smaller on the lite tier. */
export const SHOT_CELL = { full: { w: 480, h: 300 }, lite: { w: 320, h: 200 } } as const;
/** How far in front of the panel face tiles, screenshots and text sit (no z-fighting). */
const OUT = { tile: 0.03, shot: 0.07, text: 0.1 } as const;
const INK = { title: "#f8fafc", body: "#cbd5e1", cyan: "#22d3ee" } as const;

/** A point on a station face: `u` along it (the reader's right), at height `y`, `out` toward the plaza. */
export function onPanel(s: HallStation, u: number, y: number, out: number = OUT.text): [number, number, number] {
  return [s.front.x + s.right.x * u - s.facing.x * out, y, s.front.z + s.right.z * u - s.facing.z * out];
}

/** A thin box on a station face (stat tile, screenshot frame), `w` along the face. */
function faceBox(s: HallStation, u: number, yCenter: number, w: number, h: number, depth = 0.06): Box {
  const [x, , z] = onPanel(s, u, 0, OUT.tile);
  const along = Math.abs(s.right.x) > 0.5;
  return { x, z, y: yCenter - h / 2, w: along ? w : depth, d: along ? depth : w, h };
}

/** Plinths, panels, the four stat tiles and one frame per screenshot. */
export function hallSolids(projectCount: number): Box[] {
  const P = HALL.panel;
  const out: Box[] = [];
  for (const name of ["about", "projects", "experience", "contact"] as const) {
    const s = stationOf(name);
    const r = s.rect;
    out.push({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, y: 0, w: r.maxX - r.minX, d: r.maxZ - r.minZ, h: P.plinth });
    const along = Math.abs(s.right.x) > 0.5;
    out.push({
      x: s.front.x + (s.facing.x * P.depth) / 2,
      z: s.front.z + (s.facing.z * P.depth) / 2,
      y: P.plinth,
      w: along ? s.width : P.depth,
      d: along ? P.depth : s.width,
      h: P.h - P.plinth,
    });
  }
  const about = stationOf("about");
  for (const u of STAT_U) out.push(faceBox(about, u, TILE.y, TILE.w, TILE.h));
  const projects = stationOf("projects");
  for (const u of SHOT_U.slice(0, projectCount)) out.push(faceBox(projects, u, SHOT.y, SHOT.w + 0.2, SHOT.h + 0.2));
  return out;
}

/** Every hall text (station faces plus the floor sign), for one `BatchedLabels`. */
export function hallLabels(input: HallInput, labels: HallLabels, fonts: HallFonts): BatchedLabel[] {
  const out: BatchedLabel[] = [];
  const add = (s: HallStation, u: number, y: number, text: string, font: string, fontSize: number, color: string, extra: Partial<BatchedLabel> = {}) => {
    if (text.trim()) out.push({ text, position: onPanel(s, u, y), yaw: s.yaw, font, fontSize, color, textAlign: "center", ...extra });
  };
  const eyebrow = (s: HallStation, n: number, title: string) =>
    add(s, 0, 5.55, `0${n} · ${title.toUpperCase()}`, fonts.mono, 0.2, HALL.tone[s.station], { letterSpacing: 0.12, maxWidth: s.width - 1 });

  const about = stationOf("about");
  eyebrow(about, 1, labels.about);
  add(about, 0, 4.9, input.profile.name, fonts.sansBold, 0.6, INK.title, { maxWidth: about.width - 0.6 });
  add(about, 0, 4.25, input.profile.headline, fonts.sans, 0.3, INK.cyan, { maxWidth: about.width - 0.6 });
  input.stats.slice(0, HIGHLIGHT_STAT_COUNT).forEach((stat, i) => {
    add(about, STAT_U[i], TILE.y + 0.55, stat.value, fonts.sansBold, 0.5, INK.title, { maxWidth: TILE.w - 0.2 });
    add(about, STAT_U[i], TILE.y + 0.15, stat.label, fonts.sans, 0.14, INK.body, { anchorY: "top", maxWidth: TILE.w - 0.2, lineHeight: 1.2 });
  });
  add(about, 0, 1.3, input.roof.subheadline, fonts.sans, 0.24, INK.body, { maxWidth: about.width - 0.6 });

  const projects = stationOf("projects");
  eyebrow(projects, 2, labels.projects);
  input.highlights.projects.slice(0, SHOT_U.length).forEach((p, i) => {
    add(projects, SHOT_U[i], 1.75, p.title, fonts.sansBold, 0.24, INK.title, { maxWidth: SHOT.w });
    add(projects, SHOT_U[i], 1.35, input.labs.wings[p.wing].toUpperCase(), fonts.mono, 0.14, HALL.tone.projects, { letterSpacing: 0.1, maxWidth: SHOT.w });
    // Live sites (R4-J) come from the L3 payload through the guarded selector; the link itself lives in the drawer.
    if (podLiveLink(input.labs.pods.find((pod) => pod.slug === p.slug) ?? {})) {
      add(projects, SHOT_U[i], 0.95, labels.visitLive.toUpperCase(), fonts.mono, 0.13, INK.cyan, { letterSpacing: 0.1, maxWidth: SHOT.w });
    }
  });

  const experience = stationOf("experience");
  eyebrow(experience, 3, labels.experience);
  const rows = experienceRows(input.career);
  const columns = [
    { u: -4.4, title: labels.employment, list: rows.employment, tone: CAREER_TONE.job },
    { u: 4.4, title: labels.freelance, list: rows.freelance, tone: CAREER_TONE.freelance },
  ];
  for (const col of columns) {
    const left = col.u - 3.9;
    const row = { anchorX: "left" as const, textAlign: "left" as const, maxWidth: 7.8 };
    add(experience, col.u, 5.0, col.title.toUpperCase(), fonts.mono, 0.24, col.tone, { letterSpacing: 0.12, maxWidth: 7.8 });
    col.list.slice(0, HALL_ROWS).forEach((e, i) => {
      const y = ROLE.top - i * ROLE.step;
      add(experience, left, y, e.org, fonts.sansBold, 0.26, INK.title, row);
      add(experience, left, y - 0.3, `${e.role} · ${e.period}`, fonts.sans, 0.17, INK.body, row);
    });
    const hidden = col.list.length - HALL_ROWS;
    if (hidden > 0) add(experience, left, ROLE.top - HALL_ROWS * ROLE.step, labels.more(hidden), fonts.mono, 0.16, col.tone, row);
  }

  const contact = stationOf("contact");
  eyebrow(contact, 4, labels.contact);
  add(contact, 0, 4.85, input.roof.availability, fonts.sansBold, 0.36, INK.title, { maxWidth: contact.width - 1 });
  add(contact, 0, 3.9, input.roof.email, fonts.mono, 0.42, INK.cyan, { maxWidth: contact.width - 1 });
  add(contact, 0, 3.0, input.roof.channels.map((c) => c.label).join(" · "), fonts.sans, 0.22, INK.body, { maxWidth: contact.width - 1 });
  add(contact, 0, 2.2, labels.cvHint, fonts.mono, 0.18, HALL.tone.contact, { maxWidth: contact.width - 1 });

  // Floor sign on the passage, flat on the road, read from the plaza side.
  out.push({ text: labels.hall.toUpperCase(), position: [HALL.sign.x, 0.03, HALL.sign.z], yaw: 0, tilt: Math.PI / 2, font: fonts.monoBold, fontSize: 0.9, color: HALL.tone.about, letterSpacing: 0.1 });
  return out;
}

export interface ShotQuad {
  /** Atlas cell (project order). */
  index: number;
  center: [number, number, number];
  right: Vec2;
  w: number;
  h: number;
}

/** One quad per project screenshot on the projects panel. */
export function hallShots(count: number): ShotQuad[] {
  const s = stationOf("projects");
  return SHOT_U.slice(0, count).map((u, index) => ({ index, center: onPanel(s, u, SHOT.y, OUT.shot), right: s.right, w: SHOT.w, h: SHOT.h }));
}

/** Positions, uvs and indices for the screenshot quads over a one-row atlas of `count` cells (one draw call). */
export function shotQuadBuffers(quads: readonly ShotQuad[], count: number) {
  const positions = new Float32Array(quads.length * 12);
  const uvs = new Float32Array(quads.length * 8);
  const indices = new Uint16Array(quads.length * 6);
  quads.forEach((q, i) => {
    const hx = (q.right.x * q.w) / 2;
    const hz = (q.right.z * q.w) / 2;
    const hy = q.h / 2;
    const [x, y, z] = q.center;
    positions.set([x - hx, y - hy, z - hz, x + hx, y - hy, z + hz, x + hx, y + hy, z + hz, x - hx, y + hy, z - hz], i * 12);
    const u0 = q.index / count;
    const u1 = (q.index + 1) / count;
    uvs.set([u0, 0, u1, 0, u1, 1, u0, 1], i * 8);
    const b = i * 4;
    indices.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
  });
  return { positions, uvs, indices };
}

/** Source rectangle that covers a `cw` x `ch` cell with an `iw` x `ih` image (centered crop). */
export function coverCrop(iw: number, ih: number, cw: number, ch: number): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(cw / iw, ch / ih);
  const sw = cw / scale;
  const sh = ch / scale;
  return { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh };
}
