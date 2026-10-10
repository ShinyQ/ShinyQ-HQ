import { LOBBY } from "../../config";

/** Certification badges stand in front of the wall, louvered 45 degrees toward the plaza. */
export const CERT_BADGE = { w: 1.75, h: 2.3, offset: 1.05, y: 2.75 } as const;
/** Skills wall text block (wall-local units): item font size, line height factor, top inset, logo size. */
export const SKILLS_TEXT = { itemSize: 0.4, itemLine: 1.3, itemTop: 1.25, icon: 0.4, iconGap: 0.55, labelSize: 0.46 } as const;

/** Height left under the last item of a column with `items` lines (must stay above the wall base). */
export function skillsTextBottom(items: number): number {
  return LOBBY.skillsWall.h - SKILLS_TEXT.itemTop - items * SKILLS_TEXT.itemSize * SKILLS_TEXT.itemLine;
}

/** Monogram hexagon radius and height on the hologram pedestal. */
export const HOLOGRAM = { hexRadius: 2.3, y: 3.4 } as const;
/** Half of the name/headline text block width (Text maxWidth 14). */
const TITLE_HALF_WIDTH = 7;
const BOB = 0.15;

export interface Box {
  name: string;
  min: [number, number, number];
  max: [number, number, number];
}

const box = (name: string, cx: number, cz: number, hw: number, hd: number, y0: number, y1: number): Box => ({
  name,
  min: [cx - hw, y0, cz - hd],
  max: [cx + hw, y1, cz + hd],
});

/**
 * World-space bounds of every Lobby element (floor-local), for the layout test and future
 * placement checks. Billboarded tiles and the title use their full width in x and z because they
 * can face any direction while the camera orbits. `ringTurn` rotates the stats ring.
 */
export function lobbyElements(statCount: number, ringTurn = 0): Box[] {
  const { hologram: h, statsTile: t, skillsWall: sw, certWall: cw, kiosk: k } = LOBBY;
  const out: Box[] = [
    box("pedestal", h.x, h.z, h.radius + 0.2, h.radius + 0.2, 0, 0.62),
    box("monogram", h.x, h.z, HOLOGRAM.hexRadius, HOLOGRAM.hexRadius, 0.62, HOLOGRAM.y + HOLOGRAM.hexRadius + BOB),
    box("title", h.x, h.z, TITLE_HALF_WIDTH, TITLE_HALF_WIDTH, LOBBY.titleY - 0.6, LOBBY.titleY + 0.9),
    // The skills wall title floats 0.3 u above the wall.
    box("skills-wall", sw.x, sw.z, sw.w / 2, sw.d / 2 + 0.05, 0, sw.h + 0.8),
    {
      name: "cert-wall",
      min: [cw.x - CERT_BADGE.offset - (CERT_BADGE.w / 2) * Math.SQRT1_2, 0, cw.z - cw.d / 2],
      max: [cw.x + cw.w / 2, cw.h + 0.8, cw.z + cw.d / 2],
    },
    // Body plus the tilted screen above it (rotated 45 degrees, offset toward the camera).
    box("kiosk", k.x + 0.15, k.z + 0.15, k.w / 2 + 0.3, k.d / 2 + 0.6, 0, 3.2),
    box("elevator-door", -24, 0, 1, 1.6, 0, 3.2),
  ];
  for (let i = 0; i < statCount; i++) {
    const a = (i / statCount) * Math.PI * 2 + Math.PI / 4 + ringTurn;
    const y = t.y + (i % 2) * t.stagger;
    out.push(
      box(
        `tile-${i}`,
        h.x + Math.sin(a) * LOBBY.statsRadius,
        h.z + Math.cos(a) * LOBBY.statsRadius,
        t.w / 2,
        t.w / 2,
        y - t.h / 2 - BOB,
        y + t.h / 2 + BOB,
      ),
    );
  }
  return out;
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return [0, 1, 2].every((i) => a.min[i] < b.max[i] && b.min[i] < a.max[i]);
}

/** Closest and farthest horizontal distance from the plaza center to a box. */
export function radialSpan(b: Box): { near: number; far: number } {
  const { x, z } = LOBBY.hologram;
  const dx = Math.max(b.min[0] - x, 0, x - b.max[0]);
  const dz = Math.max(b.min[2] - z, 0, z - b.max[2]);
  const fx = Math.max(Math.abs(b.min[0] - x), Math.abs(b.max[0] - x));
  const fz = Math.max(Math.abs(b.min[2] - z), Math.abs(b.max[2] - z));
  return { near: Math.hypot(dx, dz), far: Math.hypot(fx, fz) };
}
