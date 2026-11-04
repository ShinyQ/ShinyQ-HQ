import { CAREER_TONE } from "../../fx/holoIcons";
import type { BatchedLabel } from "../../fx/labelProps";
import type { ExperienceData, Vec2 } from "../../types";
import { podLiveLink } from "@/content/selectors";
import { ABOUT, aboutFace, ARCH, BEACON, contactBeacon, experienceArch, MONOLITH, monoliths, NOW_ARCH, nowArch, onFace, SHOT, statTiles, winsFace, winsTiles, type Face } from "./hallGallery";
import { HALL } from "./hallLayout";
import { experienceRows, HIGHLIGHT_STAT_COUNT, HIGHLIGHT_STATIONS, type HighlightStation } from "./stations";
import { brandPhotoSrc } from "@/lib/brand-photo";

/**
 * Pure scenery data for the Highlights Hall gallery: every text on the station shapes (`hallGallery.ts`)
 * in one troika BatchedText, the three screenshots on the monoliths and the owner's portrait (the About me
 * hologram disc) from one atlas. Positions are floor-local; face coordinates are `u` along the face
 * (the reader's right) and the height `y`.
 */

export interface HallLabels {
  about: string;
  projects: string;
  experience: string;
  wins: string;
  now: string;
  results: string;
  contact: string;
  /** The wins station: "{firsts} first places", "{placings} competition placings", the ring's caption and the hint. */
  winsTitle: (firsts: number) => string;
  winsLine: (placings: number) => string;
  winsRing: string;
  winsHint: string;
  /** Tier names on the wins tiles: 1st, 2nd and 3rd place, finalists and honors. */
  tiers: Record<"gold" | "silver" | "bronze" | "honor", string>;
  employment: string;
  freelance: string;
  /** "+{count} more in the drawer" */
  more: (count: number) => string;
  cvHint: string;
  /** The floating sign on the gateway arch. */
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
/** Experience rows: the first org line and the step between rows (org plus role and period). */
const ROLE = { top: 5.0, step: 0.6 } as const;
/** Results per monolith in 3D (the drawer lists every one), and each block's value line, top first. */
export const RESULT_ROWS = 3;
export const RESULT_Y = [5.7, 3.95, 2.2] as const;
/** The wins tiles' tones, by tier (the ring and the eyebrow take the station's pink). */
export const TIER_TONE = { gold: "#fbbf24", silver: "#e5e7eb", bronze: "#d97706", honor: "#22d3ee" } as const;
export { SHOT };
/** Atlas cell per screenshot (16:10), smaller on the lite tier. */
export const SHOT_CELL = { full: { w: 480, h: 300 }, lite: { w: 320, h: 200 } } as const;
/** The owner's portrait (owner decision 2026-10-13), drawn as the About me hologram disc. */
export const PHOTO_SRC = brandPhotoSrc(320);
/** The light studio backdrop would bloom on the full tier; drawn slightly darker it reads like the screenshots. */
export const PHOTO_BRIGHTNESS = 0.85;
/** How far in front of a face screenshots and text sit (no z-fighting). */
const OUT = { shot: 0.03, text: 0.08 } as const;
const INK = { title: "#f8fafc", body: "#cbd5e1", cyan: "#22d3ee" } as const;

/** Every hall text for one `BatchedLabels`; `tile[i]` is the stat tile label `i` rides with (it drifts with it), or -1. */
export interface HallTexts {
  labels: BatchedLabel[];
  tile: number[];
}

/** Every hall text on the station shapes, for one `BatchedLabels`. The gateway sign floats on its own (`GateSign`). */
export function hallTexts(input: HallInput, labels: HallLabels, fonts: HallFonts): HallTexts {
  const out: BatchedLabel[] = [];
  const tile: number[] = [];
  const add = (f: Face, u: number, y: number, text: string, font: string, fontSize: number, color: string, extra: Partial<BatchedLabel> = {}, d: number = OUT.text, tileIndex = -1) => {
    if (!text.trim()) return;
    out.push({ text, position: onFace(f, u, y, d), yaw: f.yaw, font, fontSize, color, textAlign: "center", ...extra });
    tile.push(tileIndex);
  };
  const eyebrow = (f: Face, y: number, n: number, title: string, tone: string, maxWidth: number, fontSize = 0.2) =>
    add(f, 0, y, `0${n} · ${title.toUpperCase()}`, fonts.mono, fontSize, tone, { letterSpacing: 0.12, maxWidth });
  const no = (station: HighlightStation) => HIGHLIGHT_STATIONS.indexOf(station) + 1;
  const aboutTiles = Math.min(HIGHLIGHT_STAT_COUNT, input.stats.length);

  // 01 About me: eyebrow, name and headline over the portrait hologram, stat tiles in an arc, the motto in front of the column.
  const about = aboutFace();
  const A = ABOUT.text;
  eyebrow(about, A.eyebrow, no("about"), labels.about, HALL.tone.about, 9);
  add(about, 0, A.name, input.profile.name, fonts.sansBold, 0.52, INK.title, { maxWidth: 9 });
  add(about, 0, A.headline, input.profile.headline, fonts.sans, 0.28, INK.cyan, { maxWidth: 9 });
  statTiles(aboutTiles).forEach((t, i) => {
    const stat = input.stats[i];
    add(t.face, 0, t.y + 0.5, stat.value, fonts.sansBold, 0.5, INK.title, { maxWidth: t.w - 0.2 }, OUT.text, i);
    add(t.face, 0, t.y + 0.12, stat.label, fonts.sans, 0.14, INK.body, { anchorY: "top", maxWidth: t.w - 0.2, lineHeight: 1.2 }, OUT.text, i);
  });
  add(about, 0, A.motto, input.roof.subheadline, fonts.sans, 0.24, INK.body, { maxWidth: 9 }, ABOUT.column.r + 0.15);

  // 02 Top projects: one monolith per project, the title, wing and live tag under its screen.
  const list = monoliths(Math.min(MONOLITH.u.length, input.highlights.projects.length));
  if (list.length) eyebrow(list[Math.floor(list.length / 2)].face, 6.75, no("projects"), labels.projects, HALL.tone.projects, MONOLITH.w - 0.4, 0.22);
  input.highlights.projects.slice(0, list.length).forEach((p, i) => {
    const f = list[i].face;
    add(f, 0, 2.65, p.title, fonts.sansBold, 0.26, INK.title, { maxWidth: SHOT.w });
    add(f, 0, 2.2, input.labs.wings[p.wing].toUpperCase(), fonts.mono, 0.15, HALL.tone.projects, { letterSpacing: 0.1, maxWidth: SHOT.w });
    // Live sites (R4-J) come from the L3 payload through the guarded selector; the link itself lives in the drawer.
    if (podLiveLink(input.labs.pods.find((pod) => pod.slug === p.slug) ?? {})) {
      add(f, 0, 1.8, labels.visitLive.toUpperCase(), fonts.mono, 0.14, INK.cyan, { letterSpacing: 0.1, maxWidth: SHOT.w });
    }
  });

  // 03 Work experience: the title on the lintel, Employment and Freelance on the two pillars.
  const arch = experienceArch();
  eyebrow(arch.face, ARCH.h + ARCH.lintel / 2, no("experience"), labels.experience, HALL.tone.experience, 2 * ARCH.pillar.to - 1, 0.3);
  const rows = experienceRows(input.career);
  const columns = [
    { ...arch.columns[0], title: labels.employment, list: rows.employment, tone: CAREER_TONE.job },
    { ...arch.columns[1], title: labels.freelance, list: rows.freelance, tone: CAREER_TONE.freelance },
  ];
  for (const col of columns) {
    const width = col.w - 0.6;
    const left = col.u - width / 2;
    const row = { anchorX: "left" as const, textAlign: "left" as const, maxWidth: width };
    add(arch.face, col.u, 5.6, col.title.toUpperCase(), fonts.mono, 0.24, col.tone, { letterSpacing: 0.12, maxWidth: width });
    col.list.slice(0, HALL_ROWS).forEach((e, i) => {
      const y = ROLE.top - i * ROLE.step;
      add(arch.face, left, y, e.org, fonts.sansBold, 0.26, INK.title, row);
      add(arch.face, left, y - 0.3, `${e.role} · ${e.period}`, fonts.sans, 0.17, INK.body, row);
    });
    const hidden = col.list.length - HALL_ROWS;
    if (hidden > 0) add(arch.face, left, ROLE.top - HALL_ROWS * ROLE.step, labels.more(hidden), fonts.mono, 0.16, col.tone, row);
  }

  // 04 Wins: the About me layout: the counts over the pedestal, the placings in the ring, one tile per tier (riding after About me's tiles).
  const wins = winsFace();
  const W = input.highlights.wins;
  eyebrow(wins, A.eyebrow, no("wins"), labels.wins, HALL.tone.wins, 9);
  add(wins, 0, A.name, labels.winsTitle(W.firsts), fonts.sansBold, 0.52, INK.title, { maxWidth: 9 });
  add(wins, 0, A.headline, labels.winsLine(W.placings), fonts.sans, 0.28, INK.cyan, { maxWidth: 9 });
  add(wins, 0, ABOUT.disc.y + 0.12, String(W.placings), fonts.sansBold, 0.85, INK.title, { maxWidth: 2 * ABOUT.disc.r });
  add(wins, 0, ABOUT.disc.y - 0.5, labels.winsRing.toUpperCase(), fonts.mono, 0.13, HALL.tone.wins, { letterSpacing: 0.12, maxWidth: 2 * ABOUT.disc.r });
  winsTiles(W.tiers.length).forEach((t, i) => {
    const { tier, count } = W.tiers[i];
    add(t.face, 0, t.y + 0.5, String(count), fonts.sansBold, 0.5, INK.title, { maxWidth: t.w - 0.2 }, OUT.text, aboutTiles + i);
    add(t.face, 0, t.y + 0.12, labels.tiers[tier], fonts.sans, 0.16, TIER_TONE[tier], { anchorY: "top", maxWidth: t.w - 0.2, lineHeight: 1.2 }, OUT.text, aboutTiles + i);
  });
  add(wins, 0, A.motto, labels.winsHint, fonts.mono, 0.18, HALL.tone.wins, { maxWidth: 9 }, ABOUT.column.r + 0.15);

  // 05 Now: the work experience layout on a smaller arch, one current role per pillar (employment, then freelance).
  const now = nowArch();
  eyebrow(now.face, NOW_ARCH.h + NOW_ARCH.lintel / 2, no("now"), labels.now, HALL.tone.now, 2 * NOW_ARCH.pillar.to - 1, 0.3);
  input.highlights.now.slice(0, now.columns.length).forEach((role, i) => {
    const col = now.columns[i];
    const width = col.w - 0.6;
    const left = col.u - width / 2;
    const row = { anchorX: "left" as const, textAlign: "left" as const, maxWidth: width };
    // The role and period read on a phone from the stop (owner, 2026-11-02): the role 0.26 u, the period 0.24 u.
    add(now.face, left, 4.75, (role.type === "job" ? labels.employment : labels.freelance).toUpperCase(), fonts.mono, 0.22, CAREER_TONE[role.type], { ...row, letterSpacing: 0.12 });
    add(now.face, left, 4.4, role.org, fonts.sansBold, 0.3, INK.title, { ...row, anchorY: "top", lineHeight: 1.15 });
    add(now.face, left, 3.55, role.role, fonts.sans, 0.26, INK.body, { ...row, anchorY: "top", lineHeight: 1.2 });
    add(now.face, left, 1.75, role.period, fonts.monoBold, 0.24, HALL.tone.now, row);
  });

  // 06 Results: three verified before and after results per monolith: the value, what it measures and its case study.
  const R = input.highlights.results;
  const stones = monoliths(Math.min(MONOLITH.u.length, Math.ceil(R.length / RESULT_ROWS)), "results");
  if (stones.length) eyebrow(stones[Math.floor(stones.length / 2)].face, 6.75, no("results"), labels.results, HALL.tone.results, MONOLITH.w - 0.4, 0.22);
  stones.forEach((m, i) => {
    R.slice(i * RESULT_ROWS, (i + 1) * RESULT_ROWS).forEach((r, k) => {
      const y = RESULT_Y[k];
      add(m.face, 0, y, r.value, fonts.sansBold, 0.4, INK.title, { maxWidth: SHOT.w });
      add(m.face, 0, y - 0.3, r.label, fonts.sans, 0.15, INK.body, { anchorY: "top", maxWidth: SHOT.w, lineHeight: 1.2 });
      add(m.face, 0, y - 1.05, r.project.toUpperCase(), fonts.mono, 0.12, HALL.tone.results, { letterSpacing: 0.08, maxWidth: SHOT.w });
    });
  });
  const hiddenResults = R.length - stones.length * RESULT_ROWS;
  if (stones.length && hiddenResults > 0) add(stones[stones.length - 1].face, 0, 0.75, labels.more(hiddenResults), fonts.mono, 0.16, HALL.tone.results, { maxWidth: SHOT.w });

  // 07 Contact: the card floating beside the beacon.
  const card = contactBeacon().card.face;
  const w = BEACON.card.w - 0.6;
  eyebrow(card, 5.35, no("contact"), labels.contact, HALL.tone.contact, w);
  add(card, 0, 4.75, input.roof.availability, fonts.sansBold, 0.36, INK.title, { maxWidth: w });
  add(card, 0, 3.95, input.roof.email, fonts.mono, 0.42, INK.cyan, { maxWidth: w });
  add(card, 0, 3.15, input.roof.channels.map((c) => c.label).join(" · "), fonts.sans, 0.22, INK.body, { maxWidth: w });
  add(card, 0, 2.4, labels.cvHint, fonts.mono, 0.18, HALL.tone.contact, { maxWidth: w });
  return { labels: out, tile };
}

/**
 * The hall's texts of one part (`HighlightsHall` draws one batch per part, `partOf` by each label's position). Each label
 * keeps its tile index (every stat tile stands in the north part, so the other parts carry none).
 */
export function partTexts<K extends string>(texts: HallTexts, partOf: (x: number, z: number) => K, part: K): HallTexts {
  const out: HallTexts = { labels: [], tile: [] };
  texts.labels.forEach((label, i) => {
    if (partOf(label.position[0], label.position[2]) !== part) return;
    out.labels.push(label);
    out.tile.push(texts.tile[i]);
  });
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

/** One quad per project screenshot, on its monolith. */
export function hallShots(count: number): ShotQuad[] {
  return monoliths(count).map((m, index) => ({ index, center: onFace(m.face, 0, SHOT.y, OUT.shot), right: m.face.right, w: SHOT.w, h: SHOT.h }));
}

/** The portrait hologram disc over the About me pedestal (the square around the disc); `index` is its atlas cell (after the screenshots). */
export function hallPhoto(index: number): ShotQuad {
  const f = aboutFace();
  const size = ABOUT.disc.r * 2;
  return { index, center: onFace(f, 0, ABOUT.disc.y, 0), right: f.right, w: size, h: size };
}

/** One cell of the hall atlas: an image drawn with cover fit at `x` (px), over the full atlas height. */
export interface AtlasCell {
  src: string;
  x: number;
  w: number;
  h: number;
  /** Canvas brightness filter for this cell (1 keeps the image as is). */
  brightness: number;
}

export interface HallAtlas {
  cells: AtlasCell[];
  width: number;
  height: number;
}

/** The project screenshots (16:10 cells) and then the portrait (a square cell) in one row: one texture, one draw call. */
export function hallAtlas(thumbs: readonly string[], cell: { w: number; h: number }): HallAtlas {
  const cells: AtlasCell[] = thumbs.map((src, i) => ({ src, x: i * cell.w, w: cell.w, h: cell.h, brightness: 1 }));
  cells.push({ src: PHOTO_SRC, x: thumbs.length * cell.w, w: cell.h, h: cell.h, brightness: PHOTO_BRIGHTNESS });
  return { cells, width: thumbs.length * cell.w + cell.h, height: cell.h };
}

/** Source rectangle that covers a `cw` x `ch` cell with an `iw` x `ih` image (centered crop). */
export function coverCrop(iw: number, ih: number, cw: number, ch: number): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(cw / iw, ch / ih);
  const sw = cw / scale;
  const sh = ch / scale;
  return { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh };
}
