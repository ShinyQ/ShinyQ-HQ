import type { BatchedLabel } from "../../fx/labelProps";
import type { ExperienceData, Vec2 } from "../../types";
import { podLiveLink } from "@/content/selectors";
import { ABOUT, aboutFace, BEACON, contactBeacon, experienceArch, faceOf, MONOLITH, monoliths, nowArch, nowCard, onFace, SHOT, statTiles, winsFace, winsTiles, type Face } from "./hallGallery";
import { HALL, stationOf } from "./hallLayout";
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
  /** The plaza's centrepieces and the now terminals' badge (owner, 2026-11-04). */
  impactOrbit: string;
  signalSpire: string;
  live: string;
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
export const ROLE = { top: 5.0, step: 0.6 } as const;
/** Results per monolith in 3D (the drawer lists every one), and each block's value line, top first. */
export const RESULT_ROWS = 3;
export const RESULT_Y = [5.7, 3.95, 2.2] as const;
/** The wins tiles' tones, by tier (the ring and the eyebrow take the station's pink). */
export const TIER_TONE = { gold: "#fbbf24", silver: "#e5e7eb", bronze: "#d97706", honor: "#a78bfa" } as const;
/** The B4 violet, beside the cyan station accent (`HALL.tone`). */
const ACCENT_ALT = "#a78bfa";
export { SHOT };
/** Atlas cell per screenshot (16:10), smaller on the lite tier. */
export const SHOT_CELL = { full: { w: 480, h: 300 }, lite: { w: 320, h: 200 } } as const;
/** The owner's portrait (owner decision 2026-10-13), drawn as the About me hologram disc. */
export const PHOTO_SRC = brandPhotoSrc(320);
/** The light studio backdrop would bloom on the full tier; drawn slightly darker it reads like the screenshots. */
export const PHOTO_BRIGHTNESS = 0.85;
/** How far in front of a face screenshots and text sit (no z-fighting). */
const OUT = { shot: 0.03, text: 0.08 } as const;
/** B4 inks (owner decision 2026-11-04): titles near white, body text cool grey, small lines in the B4 sub tone, the cyan accent. */
const INK = { title: "#eefbff", body: "#c9d6e3", sub: "#8fb3c9", cyan: "#6ee7ff" } as const;
/** Station headers float over each station (its case top, `HEADER.over` above its height): the spaced number line over the title. */
export const HEADER = { over: 0.6, number: 0.95, title: 0.42 } as const;

/**
 * Every hall text for one `BatchedLabels`; `tile[i]` is the stat tile label `i` rides with (it drifts with it), or -1;
 * `group[i]` names the station content it belongs to, so the interiors chunk can replace a group with its own (`"columns"`:
 * the work experience pillar columns).
 */
export interface HallTexts {
  labels: BatchedLabel[];
  tile: number[];
  group: string[];
}

/** Every hall text on the station shapes, for one `BatchedLabels`. The gateway sign floats on its own (`GateSign`). */
export function hallTexts(input: HallInput, labels: HallLabels, fonts: HallFonts): HallTexts {
  const out: BatchedLabel[] = [];
  const tile: number[] = [];
  const group: string[] = [];
  let current = "";
  const add = (f: Face, u: number, y: number, text: string, font: string, fontSize: number, color: string, extra: Partial<BatchedLabel> = {}, d: number = OUT.text, tileIndex = -1) => {
    if (!text.trim()) return;
    out.push({ text, position: onFace(f, u, y, d), yaw: f.yaw, font, fontSize, color, textAlign: "center", ...extra });
    tile.push(tileIndex);
    group.push(current);
  };
  const no = (station: HighlightStation) => HIGHLIGHT_STATIONS.indexOf(station) + 1;
  // Station headers (B4): the spaced number line ("01  PROFILE") over the title, above the station, facing the plaza.
  current = "header";
  for (const name of HIGHLIGHT_STATIONS) {
    const s = stationOf(name);
    const f = faceOf(s.front, { x: -s.facing.x, z: -s.facing.z });
    const top = HALL.height[name] + HEADER.over;
    const width = Math.max(s.width, 8);
    add(f, 0, top + HEADER.number, `0${no(name)}  ${labels[name].toUpperCase()}`, fonts.sans, 0.2, INK.sub, { letterSpacing: 0.3, maxWidth: width }, 0);
    add(f, 0, top + HEADER.title, labels[name], fonts.sansBold, 0.56, INK.title, { maxWidth: width }, 0);
  }
  const aboutTiles = Math.min(HIGHLIGHT_STAT_COUNT, input.stats.length);

  current = "about";
  // 01 About me: eyebrow, name and headline over the portrait hologram, stat tiles in an arc, the motto in front of the column.
  const about = aboutFace();
  const A = ABOUT.text;
  add(about, 0, A.name, input.profile.name, fonts.sansBold, 0.52, INK.title, { maxWidth: 8 });
  add(about, 0, A.headline, input.profile.headline, fonts.sans, 0.28, INK.sub, { maxWidth: 8 });
  statTiles(aboutTiles).forEach((t, i) => {
    const stat = input.stats[i];
    add(t.face, 0, t.y + t.h * 0.27, stat.value, fonts.sansBold, 0.44, INK.title, { maxWidth: t.w - 0.2 }, OUT.text, i);
    add(t.face, 0, t.y + t.h * 0.03, stat.label, fonts.sans, 0.13, INK.body, { anchorY: "top", maxWidth: t.w - 0.24, lineHeight: 1.2 }, OUT.text, i);
  });
  add(about, 0, A.motto, input.roof.subheadline, fonts.sans, 0.24, INK.body, { maxWidth: 8 }, ABOUT.column.r + 0.15);

  current = "projects";
  // 02 Top projects: one monolith per project, the title, wing and live tag under its screen.
  const list = monoliths(Math.min(MONOLITH.u.length, input.highlights.projects.length));
  input.highlights.projects.slice(0, list.length).forEach((p, i) => {
    const f = list[i].face;
    add(f, 0, 2.65, p.title, fonts.sansBold, 0.26, INK.title, { maxWidth: SHOT.w });
    add(f, 0, 2.2, input.labs.wings[p.wing].toUpperCase(), fonts.sans, 0.15, INK.sub, { letterSpacing: 0.2, maxWidth: SHOT.w });
    // Live sites (R4-J) come from the L3 payload through the guarded selector; the link itself lives in the drawer.
    if (podLiveLink(input.labs.pods.find((pod) => pod.slug === p.slug) ?? {})) {
      add(f, 0, 1.8, labels.visitLive.toUpperCase(), fonts.sansBold, 0.14, INK.cyan, { letterSpacing: 0.2, maxWidth: SHOT.w });
    }
  });

  current = "experience";
  // 03 Work experience: the title on the lintel, Employment and Freelance on the two pillars.
  const arch = experienceArch();
  const rows = experienceRows(input.career);
  const columns = [
    { ...arch.columns[0], title: labels.employment, list: rows.employment, tone: HALL.tone.experience },
    { ...arch.columns[1], title: labels.freelance, list: rows.freelance, tone: ACCENT_ALT },
  ];
  current = "columns";
  for (const col of columns) {
    // 0.6 u inside the pillar each side (2026-11-04), so no line reaches the case edge.
    const width = col.w - 1.2;
    const left = col.u - width / 2;
    const row = { anchorX: "left" as const, textAlign: "left" as const, maxWidth: width };
    add(arch.face, col.u, 5.6, col.title.toUpperCase(), fonts.sans, 0.22, col.tone, { letterSpacing: 0.25, maxWidth: width });
    col.list.slice(0, HALL_ROWS).forEach((e, i) => {
      const y = ROLE.top - i * ROLE.step;
      add(arch.face, left, y, e.org, fonts.sansBold, 0.26, INK.title, row);
      add(arch.face, left, y - 0.3, `${e.role} · ${e.period}`, fonts.sans, 0.17, INK.body, row);
    });
    const hidden = col.list.length - HALL_ROWS;
    if (hidden > 0) add(arch.face, left, ROLE.top - HALL_ROWS * ROLE.step, labels.more(hidden), fonts.sans, 0.16, INK.sub, row);
  }

  current = "wins";
  // 04 Wins: the About me layout: the counts over the pedestal, the placings in the ring, one tile per tier (riding after About me's tiles).
  const wins = winsFace();
  const W = input.highlights.wins;
  add(wins, 0, A.name, labels.winsTitle(W.firsts), fonts.sansBold, 0.52, INK.title, { maxWidth: 9 });
  add(wins, 0, A.headline, labels.winsLine(W.placings), fonts.sans, 0.28, INK.sub, { maxWidth: 9 });
  add(wins, 0, ABOUT.disc.y + 0.12, String(W.placings), fonts.sansBold, 0.85, INK.title, { maxWidth: 2 * ABOUT.disc.r });
  add(wins, 0, ABOUT.disc.y - 0.5, labels.winsRing.toUpperCase(), fonts.sans, 0.12, INK.sub, { letterSpacing: 0.25, maxWidth: 2 * ABOUT.disc.r });
  winsTiles(W.tiers.length).forEach((t, i) => {
    const { tier, count } = W.tiers[i];
    add(t.face, 0, t.y + 0.5, String(count), fonts.sansBold, 0.5, INK.title, { maxWidth: t.w - 0.2 }, OUT.text, aboutTiles + i);
    add(t.face, 0, t.y + 0.12, labels.tiers[tier], fonts.sans, 0.16, TIER_TONE[tier], { anchorY: "top", maxWidth: t.w - 0.2, lineHeight: 1.2 }, OUT.text, aboutTiles + i);
  });
  add(wins, 0, A.motto, labels.winsHint, fonts.sans, 0.18, INK.sub, { maxWidth: 9 }, ABOUT.column.r + 0.15);

  current = "now";
  // 05 Now: the work experience layout on a smaller arch, one current role per pillar (employment, then freelance).
  const now = nowArch();
  input.highlights.now.slice(0, now.columns.length).forEach((role, i) => {
    // Inside its card (`nowCard`, 2026-11-04): the kicker, the org (two lines at most), the role and the period.
    const card = nowCard(now.columns[i]);
    const row = { anchorX: "left" as const, textAlign: "left" as const, maxWidth: card.text };
    // The role and period read on a phone from the stop (owner, 2026-11-02).
    add(now.face, card.left, 4.75, (role.type === "job" ? labels.employment : labels.freelance).toUpperCase(), fonts.sans, 0.19, i ? ACCENT_ALT : HALL.tone.now, { ...row, letterSpacing: 0.25, maxWidth: card.text - 0.4 });
    add(now.face, card.left, 4.47, role.org, fonts.sansBold, 0.27, INK.title, { ...row, anchorY: "top", lineHeight: 1.15 });
    add(now.face, card.left, 3.68, role.role, fonts.sans, 0.23, INK.body, { ...row, anchorY: "top", lineHeight: 1.2 });
    add(now.face, card.left, 1.62, role.period, fonts.sansBold, 0.22, INK.cyan, row);
  });

  current = "results";
  // 06 Results: three verified before and after results per monolith: the value, what it measures and its case study.
  const R = input.highlights.results;
  const stones = monoliths(Math.min(MONOLITH.u.length, Math.ceil(R.length / RESULT_ROWS)), "results");
  stones.forEach((m, i) => {
    R.slice(i * RESULT_ROWS, (i + 1) * RESULT_ROWS).forEach((r, k) => {
      const y = RESULT_Y[k];
      add(m.face, 0, y, r.value, fonts.sansBold, 0.4, INK.title, { maxWidth: SHOT.w });
      add(m.face, 0, y - 0.3, r.label, fonts.sans, 0.15, INK.body, { anchorY: "top", maxWidth: SHOT.w, lineHeight: 1.2 });
      add(m.face, 0, y - 1.05, r.project.toUpperCase(), fonts.sans, 0.12, INK.sub, { letterSpacing: 0.18, maxWidth: SHOT.w });
    });
  });
  const hiddenResults = R.length - stones.length * RESULT_ROWS;
  if (stones.length && hiddenResults > 0) add(stones[stones.length - 1].face, 0, 0.75, labels.more(hiddenResults), fonts.sans, 0.16, INK.sub, { maxWidth: SHOT.w });

  current = "contact";
  // 07 Contact: the card floating beside the beacon.
  const card = contactBeacon().card.face;
  const w = BEACON.card.w - 0.6;
  add(card, 0, 4.95, input.roof.availability, fonts.sansBold, 0.28, INK.title, { maxWidth: w });
  add(card, 0, 4.2, input.roof.email, fonts.sansBold, 0.3, INK.cyan, { maxWidth: w + 0.4 });
  add(card, 0, 3.6, input.roof.channels.map((c) => c.label).join(" · "), fonts.sans, 0.17, INK.body, { anchorY: "top", lineHeight: 1.3, maxWidth: w });
  add(card, 0, 2.1, labels.cvHint, fonts.sans, 0.16, INK.sub, { maxWidth: w });
  return { labels: out, tile, group };
}

/**
 * The hall's texts of one part (`HighlightsHall` draws one batch per part, `partOf` by each label's position). Each label
 * keeps its tile index (every stat tile stands in the north part, so the other parts carry none).
 */
export function partTexts<K extends string>(texts: HallTexts, partOf: (x: number, z: number) => K, part: K): HallTexts {
  const out: HallTexts = { labels: [], tile: [], group: [] };
  texts.labels.forEach((label, i) => {
    if (partOf(label.position[0], label.position[2]) !== part) return;
    out.labels.push(label);
    out.tile.push(texts.tile[i]);
    out.group.push(texts.group[i]);
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
