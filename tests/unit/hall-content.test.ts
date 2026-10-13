import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { getStats } from "@/content/load";
import {
  coverCrop,
  HALL_ROWS,
  hallAtlas,
  hallLabels,
  hallPhoto,
  hallShots,
  hallTexts,
  PHOTO_SRC,
  SHOT,
  SHOT_CELL,
  shotQuadBuffers,
  type HallLabels,
} from "@/experience/floors/lobby/hallContent";
import { podLiveLink } from "@/content/selectors";
import { ABOUT, aboutFace, ARCH, BEACON, contactBeacon, experienceArch, MONOLITH, monoliths, onFace, statTiles, type Face } from "@/experience/floors/lobby/hallGallery";
import { HALL, HALL_LAYOUT } from "@/experience/floors/lobby/hallLayout";
import { hallLineBuffer, hallShapes, portraitRing, prismBuffers, solidBuffers } from "@/experience/floors/lobby/hallSolids";
import type { HighlightStation } from "@/experience/floors/lobby/stations";
import { experienceRows } from "@/experience/floors/lobby/stations";
import { brandPhotoSrc } from "@/lib/brand-photo";

const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
const labels: HallLabels = {
  about: "About me",
  projects: "Top 3 projects",
  experience: "Work experience",
  contact: "Contact",
  employment: "Employment",
  freelance: "Freelance",
  more: (count) => `+${count} more`,
  visitLive: "Visit live site",
  stations: { about: "Highlights: about me", projects: "Highlights: top projects", experience: "Highlights: work experience", contact: "Highlights: contact" },
  cvHint: "CV",
  hall: "Highlights Hall",
};
const fonts = { sans: "s", sansBold: "sb", mono: "m", monoBold: "mb" };
const texts = hallLabels(data, labels, fonts);

interface Surface {
  station: HighlightStation;
  face: Face;
  width: number;
  /** Lowest and highest text height on it. */
  y: [number, number];
  /** Farthest a text may float in front of it. */
  d: number;
}

/** Every face that carries text: the About me pedestal and its tiles, the monoliths, the arch, the contact card. */
const SURFACES: Surface[] = [
  ...statTiles().map((t): Surface => ({ station: "about", face: t.face, width: t.w, y: [t.y - t.h / 2, t.y + t.h / 2], d: 0.2 })),
  { station: "about", face: aboutFace(), width: 9, y: [1, 6.4], d: ABOUT.column.r + 0.2 },
  ...monoliths(3).map((m): Surface => ({ station: "projects", face: m.face, width: MONOLITH.w, y: [0.4, MONOLITH.h], d: 0.2 })),
  { station: "experience", face: experienceArch().face, width: 2 * ARCH.pillar.to, y: [0.4, ARCH.h + ARCH.lintel], d: 0.2 },
  { station: "contact", face: contactBeacon().card.face, width: BEACON.card.w, y: [BEACON.card.y, BEACON.card.y + BEACON.card.h], d: 0.2 },
];

/** The surface a point sits on (just in front of it, within its width), and the point's `u` along it. */
function faceCoords(p: [number, number, number]) {
  for (const s of SURFACES) {
    const f = s.face;
    const d = (p[0] - f.origin.x) * f.out.x + (p[2] - f.origin.z) * f.out.z;
    const u = (p[0] - f.origin.x) * f.right.x + (p[2] - f.origin.z) * f.right.z;
    if (d >= 0 && d <= s.d && Math.abs(u) <= s.width / 2 + 1e-6) return { s, u };
  }
  return null;
}

describe("Highlights Hall scenery", () => {
  it("writes the WOW numbers, projects, roles and contact from the payload", () => {
    const all = texts.map((t) => t.text);
    expect(all).toContain(data.profile.name);
    expect(all).toContain(data.profile.headline);
    for (const stat of getStats().slice(0, 4)) expect(all).toContain(stat.value);
    for (const p of data.highlights.projects) expect(all).toContain(p.title);
    expect(all).toContain(experienceRows(data.career).employment[0].org);
    expect(all).toContain(data.roof.email);
    expect(all.every((t) => t.trim().length > 0)).toBe(true);
  });

  it("tags a project screenshot with Visit live site only when its L3 pod has an allowed live link", () => {
    const first = data.highlights.projects[0];
    const withLive = (liveUrl: string) => ({ ...data, labs: { ...data.labs, pods: data.labs.pods.map((pod) => (pod.slug === first.slug ? { ...pod, liveUrl } : { ...pod, liveUrl: undefined })) } });
    const tags = (input: typeof data) => hallLabels(input, labels, fonts).filter((t) => t.text === labels.visitLive.toUpperCase());
    const tagged = tags(withLive("https://mii-microsoft.azurewebsites.net"));
    expect(tagged).toHaveLength(1);
    expect(faceCoords(tagged[0].position)?.s.station).toBe("projects");
    // Under the first monolith's screen.
    expect(faceCoords(tagged[0].position)!.s.face).toEqual(monoliths(3)[0].face);
    // podLiveLink rejects hosts outside PUBLIC_LIVE_HOSTS, so no tag.
    expect(tags(withLive("https://internal-portal.azurewebsites.net"))).toHaveLength(0);
    // Real content: one tag per featured project whose L3 pod has a live link.
    const live = data.highlights.projects.filter((p) => podLiveLink(data.labs.pods.find((pod) => pod.slug === p.slug)!)).length;
    expect(tags(data)).toHaveLength(live);
  });

  it("shows at most HALL_ROWS roles per column and says how many more the drawer has", () => {
    const { employment, freelance } = experienceRows(data.career);
    const orgs = texts.filter((t) => t.font === fonts.sansBold && faceCoords(t.position)?.s.station === "experience");
    expect(orgs).toHaveLength(Math.min(HALL_ROWS, employment.length) + Math.min(HALL_ROWS, freelance.length));
    if (employment.length > HALL_ROWS) expect(texts.map((t) => t.text)).toContain(`+${employment.length - HALL_ROWS} more`);
  });

  it("keeps every label on its own station shape, inside its width and height, reading toward the plaza; nothing lies on the floor", () => {
    for (const t of texts) {
      expect(t.tilt, t.text).toBeUndefined();
      const at = faceCoords(t.position);
      expect(at, t.text).not.toBeNull();
      const half = at!.s.width / 2;
      const left = t.anchorX === "left" ? at!.u : at!.u - (t.maxWidth ?? 0) / 2;
      const right = t.anchorX === "left" ? at!.u + (t.maxWidth ?? 0) : at!.u + (t.maxWidth ?? 0) / 2;
      expect(left, t.text).toBeGreaterThanOrEqual(-half - 1e-6);
      expect(right, t.text).toBeLessThanOrEqual(half + 1e-6);
      expect(t.position[1], t.text).toBeGreaterThanOrEqual(at!.s.y[0]);
      expect(t.position[1], t.text).toBeLessThanOrEqual(at!.s.y[1]);
      expect(t.yaw).toBeCloseTo(at!.s.face.yaw);
    }
    // The old floor sign is gone: the gateway arch carries a floating sign (GateSign).
    expect(texts.map((t) => t.text)).not.toContain(labels.hall.toUpperCase());
  });

  it("marks the stat tile labels so they drift with their tile", () => {
    const { labels: all, tile } = hallTexts(data, labels, fonts);
    expect(tile).toHaveLength(all.length);
    for (let i = 0; i < 4; i++) {
      const own = all.filter((_, k) => tile[k] === i);
      expect(own.map((t) => t.text)).toEqual([data.stats[i].value, data.stats[i].label]);
      for (const t of own) expect(t.yaw).toBeCloseTo(statTiles()[i].face.yaw);
    }
    expect(tile.filter((k) => k >= 0)).toHaveLength(8);
  });

  it("builds the gallery solids and neon lines inside the hall, clear of the door pads", () => {
    const shapes = hallShapes(3);
    const { positions, normals, indices } = solidBuffers(shapes.boxes, shapes.prisms);
    expect(positions.length).toBe(normals.length);
    expect(Math.max(...indices)).toBeLessThan(positions.length / 3);
    for (let k = 0; k < positions.length; k += 3) {
      expect(positions[k]).toBeGreaterThanOrEqual(HALL.zone.minX - 1e-3);
      expect(positions[k]).toBeLessThanOrEqual(HALL.zone.maxX + 1e-3);
      expect(positions[k + 2]).toBeGreaterThanOrEqual(HALL.zone.minZ - 1e-3);
      expect(positions[k + 2]).toBeLessThanOrEqual(HALL.zone.maxZ + 1e-3);
      for (const s of HALL_LAYOUT.stations) {
        // Above the rover's height nothing matters; below, solids keep 0.9 u from every door pad.
        if (positions[k + 1] > 2) continue;
        expect(Math.hypot(positions[k] - s.pad.x, positions[k + 2] - s.pad.z)).toBeGreaterThan(0.9);
      }
    }
    const lines = hallLineBuffer(shapes, [portraitRing(aboutFace())]);
    expect(lines.length % 6).toBe(0);
    expect(lines.length).toBeGreaterThan(shapes.boxes.length * 72);
    // Whole-hall triangle count stays small (the 30k frame budget is shared with the Lobby).
    expect(indices.length / 3).toBeLessThan(1500);
  });

  it("winds prism faces counter-clockwise from outside", () => {
    const { positions, indices } = prismBuffers([{ x: 0, z: 0, y: 0, h: 1, r: 1, sides: 8 }]);
    const v = (i: number) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [v(indices[t]), v(indices[t + 1]), v(indices[t + 2])];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      // Outward: away from the axis on the sides, up on the cap.
      const outward = n[0] * mid[0] + n[2] * mid[2] + (n[1] > 0.5 ? 1 : 0);
      expect(outward).toBeGreaterThan(0);
    }
  });

  it("puts the screenshots on the monoliths and the portrait on the pedestal hologram, one atlas cell each", () => {
    const quads = [...hallShots(3), hallPhoto(3)];
    expect(quads.map((q) => q.index)).toEqual([0, 1, 2, 3]);
    const atlas = hallAtlas(["a", "b", "c"], SHOT_CELL.full);
    expect(atlas).toMatchObject({ width: 3 * 480 + 300, height: 300 });
    const { positions, uvs, indices } = shotQuadBuffers(quads, atlas.cells);
    expect(positions).toHaveLength(48);
    // Float32 buffers: compare against the same values rounded to float32.
    expect(Array.from(uvs.slice(0, 8))).toEqual(Array.from(new Float32Array([0, 0, 480 / 1740, 0, 480 / 1740, 1, 0, 1])));
    expect(Array.from(uvs.slice(24, 32))).toEqual(Array.from(new Float32Array([1440 / 1740, 0, 1, 0, 1, 1, 1440 / 1740, 1])));
    expect(Array.from(indices.slice(0, 6))).toEqual([0, 1, 2, 0, 2, 3]);
    const faces = [...monoliths(3).map((m) => m.face), aboutFace()];
    // Counter-clockwise as seen from the plaza: (b - a) x (c - a) points out of each face.
    for (let quad = 0; quad < 4; quad++) {
      const v = (i: number) => [positions[(quad * 4 + i) * 3], positions[(quad * 4 + i) * 3 + 1], positions[(quad * 4 + i) * 3 + 2]];
      const [a, b, c] = [v(0), v(1), v(2)];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      expect(n[0] * faces[quad].out.x + n[2] * faces[quad].out.z).toBeGreaterThan(0);
    }
    for (const [i, q] of hallShots(3).entries()) {
      expect(q.w).toBe(SHOT.w);
      expect(q.center).toEqual(onFace(monoliths(3)[i].face, 0, SHOT.y, 0.03));
    }
  });

  it("floats the portrait hologram over the column, between the tiles and under the name", () => {
    const quad = hallPhoto(3);
    expect(quad.center[0]).toBeCloseTo(ABOUT.center.x);
    expect(quad.center[1] - quad.h / 2).toBeGreaterThan(ABOUT.base.h + ABOUT.column.h + 0.5);
    expect(quad.center[1] + quad.h / 2).toBeLessThan(ABOUT.text.headline - 0.3);
    expect(PHOTO_SRC).toBe(brandPhotoSrc(320));
    expect(hallAtlas(["a"], SHOT_CELL.lite).cells.at(-1)).toMatchObject({ src: PHOTO_SRC, x: 320, w: 200, h: 200 });
  });

  it("fits the headline in one line over the portrait (EN and ID)", () => {
    for (const locale of ["en", "id"] as const) {
      const d = buildExperienceData(locale, { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
      const headline = hallLabels(d, labels, fonts).find((t) => t.text === d.profile.headline)!;
      // Rough advance of the sans face: 0.55 em per character.
      expect(Math.ceil((headline.text.length * headline.fontSize * 0.55) / headline.maxWidth!), locale).toBeLessThanOrEqual(1);
    }
  });

  it("crops screenshots to cover their cell", () => {
    const same = coverCrop(1600, 1000, 480, 300);
    expect(same.sx).toBeCloseTo(0);
    expect(same.sy).toBeCloseTo(0);
    expect(same.sw).toBeCloseTo(1600);
    expect(same.sh).toBeCloseTo(1000);
    const wide = coverCrop(1920, 1080, 480, 300);
    expect(wide.sh).toBeCloseTo(1080);
    expect(wide.sw).toBeCloseTo(1728);
    expect(wide.sx).toBeCloseTo(96);
  });
});
