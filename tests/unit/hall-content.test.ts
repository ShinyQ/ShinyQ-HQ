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
  hallSolids,
  onPanel,
  PHOTO,
  PHOTO_SRC,
  SHOT_CELL,
  shotQuadBuffers,
  type HallLabels,
} from "@/experience/floors/lobby/hallContent";
import { podLiveLink } from "@/content/selectors";
import { HALL, HALL_LAYOUT, stationOf } from "@/experience/floors/lobby/hallLayout";
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

/** The station whose face a point sits on (just in front of it, within its width), and the point's `u` along that face. */
function faceCoords(p: [number, number, number]) {
  for (const s of HALL_LAYOUT.stations) {
    const d = -((p[0] - s.front.x) * s.facing.x + (p[2] - s.front.z) * s.facing.z);
    const u = (p[0] - s.front.x) * s.right.x + (p[2] - s.front.z) * s.right.z;
    if (d >= 0 && d < 0.2 && Math.abs(u) <= s.width / 2 + 1e-6) return { s, u };
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
    expect(faceCoords(tagged[0].position)).toMatchObject({ s: stationOf("projects") });
    expect(faceCoords(tagged[0].position)!.u).toBeCloseTo(-5.2);
    // podLiveLink rejects hosts outside PUBLIC_LIVE_HOSTS, so no tag.
    expect(tags(withLive("https://internal-portal.azurewebsites.net"))).toHaveLength(0);
    // Real content: one tag per featured project whose L3 pod has a live link.
    const live = data.highlights.projects.filter((p) => podLiveLink(data.labs.pods.find((pod) => pod.slug === p.slug)!)).length;
    expect(tags(data)).toHaveLength(live);
  });

  it("shows at most HALL_ROWS roles per column and says how many more the drawer has", () => {
    const { employment, freelance } = experienceRows(data.career);
    const experience = stationOf("experience");
    const orgs = texts.filter((t) => t.font === fonts.sansBold && faceCoords(t.position)?.s === experience);
    expect(orgs).toHaveLength(Math.min(HALL_ROWS, employment.length) + Math.min(HALL_ROWS, freelance.length));
    if (employment.length > HALL_ROWS) expect(texts.map((t) => t.text)).toContain(`+${employment.length - HALL_ROWS} more`);
  });

  it("keeps every station label on its own panel, between the plinth and the panel top", () => {
    for (const t of texts.filter((t) => !t.tilt)) {
      const at = faceCoords(t.position);
      expect(at, t.text).not.toBeNull();
      const half = at!.s.width / 2;
      const left = t.anchorX === "left" ? at!.u : at!.u - (t.maxWidth ?? 0) / 2;
      const right = t.anchorX === "left" ? at!.u + (t.maxWidth ?? 0) : at!.u + (t.maxWidth ?? 0) / 2;
      expect(left, t.text).toBeGreaterThanOrEqual(-half - 1e-6);
      expect(right, t.text).toBeLessThanOrEqual(half + 1e-6);
      expect(t.position[1], t.text).toBeGreaterThan(HALL.panel.plinth);
      expect(t.position[1], t.text).toBeLessThan(HALL.panel.h);
      expect(t.yaw).toBe(at!.s.yaw);
    }
    const sign = texts.filter((t) => t.tilt);
    expect(sign).toHaveLength(1);
    expect(sign[0].position).toEqual([HALL.sign.x, 0.03, HALL.sign.z]);
  });

  it("builds plinths, panels, stat tiles and screenshot frames inside the hall, clear of the door pads", () => {
    const solids = hallSolids(3);
    // Plinths, panels, stat tiles, the portrait frame, screenshot frames.
    expect(solids).toHaveLength(4 + 4 + 4 + 1 + 3);
    for (const b of solids) {
      expect(b.x - b.w / 2).toBeGreaterThanOrEqual(HALL.zone.minX);
      expect(b.x + b.w / 2).toBeLessThanOrEqual(HALL.zone.maxX + 1e-6);
      for (const s of HALL_LAYOUT.stations) {
        const dx = Math.max(0, Math.abs(s.pad.x - b.x) - b.w / 2);
        const dz = Math.max(0, Math.abs(s.pad.z - b.z) - b.d / 2);
        expect(Math.hypot(dx, dz)).toBeGreaterThan(0.9);
      }
    }
  });

  it("puts the screenshots on the projects panel and the portrait on the about panel, one atlas cell each", () => {
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
    // Counter-clockwise as seen from the plaza: (b - a) x (c - a) points out of the panel.
    for (const [quad, station] of [[0, "projects"], [3, "about"]] as const) {
      const v = (i: number) => [positions[(quad * 4 + i) * 3], positions[(quad * 4 + i) * 3 + 1], positions[(quad * 4 + i) * 3 + 2]];
      const [a, b, c] = [v(0), v(1), v(2)];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const s = stationOf(station);
      expect(n[0] * -s.facing.x + n[2] * -s.facing.z).toBeGreaterThan(0);
    }
    const projects = stationOf("projects");
    expect(onPanel(projects, 0, 1, 0)).toEqual([projects.front.x, 1, projects.front.z]);
  });

  it("frames the portrait on the About me panel, above the stat tiles and left of the text block", () => {
    const about = stationOf("about");
    const quad = hallPhoto(3);
    const at = faceCoords(quad.center);
    expect(at?.s).toBe(about);
    expect(at!.u - PHOTO.size / 2).toBeGreaterThanOrEqual(-about.width / 2);
    // Stat tiles end at 3.8 (TILE.y 2.9 + half of 1.8); the frame is 0.1 wider than the photo on each side.
    expect(quad.center[1] - PHOTO.size / 2 - 0.1).toBeGreaterThan(3.8);
    expect(quad.center[1] + PHOTO.size / 2 + 0.1).toBeLessThan(HALL.panel.h);
    for (const t of texts.filter((t) => faceCoords(t.position)?.s === about && t.position[1] > 3.8)) {
      expect(faceCoords(t.position)!.u, t.text).toBeGreaterThanOrEqual(PHOTO.u + PHOTO.size / 2 + 0.2);
    }
    expect(PHOTO_SRC).toBe(brandPhotoSrc(320));
    expect(hallAtlas(["a"], SHOT_CELL.lite).cells.at(-1)).toMatchObject({ src: PHOTO_SRC, x: 320, w: 200, h: 200 });
  });

  it("fits the headline in two lines beside the portrait (EN and ID)", () => {
    for (const locale of ["en", "id"] as const) {
      const d = buildExperienceData(locale, { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
      const headline = hallLabels(d, labels, fonts).find((t) => t.text === d.profile.headline)!;
      // Rough advance of the sans face: 0.55 em per character.
      expect(Math.ceil((headline.text.length * headline.fontSize * 0.55) / headline.maxWidth!), locale).toBeLessThanOrEqual(2);
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
