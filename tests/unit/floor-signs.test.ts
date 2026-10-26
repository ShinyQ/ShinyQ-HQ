import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { L4_SIGN, librarySigns, SHELF_SIGN, stationBackEdge, TITLE_SIGN, ZONE_SIGN, zoneSignSpecs, type LibrarySignKind } from "@/experience/floors/library/decor/signs";
import { baySlots, SHELF_PLINTH } from "@/experience/floors/library/slots";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { LIBRARY_FLOOR, libraryLayoutInput, roomOfPost, ZONE_TONE } from "@/experience/floors/library/model";
import { signPlate } from "@/experience/fx/signLayout";
import { ROVER_HEIGHT } from "@/experience/config";

const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
const library = buildLibraryLayout(libraryLayoutInput(data.library));
const zones = { blog: "Blog", research: "Research", models: "Models and datasets", talks: "Talks and workshops" };

/** Every line of a wrapped sign fits the wrap width (a single long word may not). */
const wrapped = (text: string, wrap: number) => text.split("\n").every((l) => l.length <= wrap || !l.includes(" "));

describe("L4 floating signs (Round 7 F: one height rule)", () => {
  const titles = new Map(data.library.posts.map((p) => [p.slug, p.title]));
  const tracks = new Map(data.library.tracks.map((t) => [t.slug, t.label]));
  const all = librarySigns({ layout: library, zones, titles, tracks });
  const ofKind = (kind: LibrarySignKind) => all.signs.filter((_, i) => all.meta[i].kind === kind);
  const featured = library.stations[0];

  it("hangs one sign per present zone over the back edge of its first station, off the road, plate bottom on the one L4 height", () => {
    const signs = zoneSignSpecs(library, zones);
    expect(signs).toHaveLength(new Set(library.stations.map((s) => s.zone)).size);
    for (const s of signs) {
      const zone = (Object.keys(zones) as (keyof typeof zones)[]).find((z) => zones[z].toUpperCase() === s.text)!;
      const first = library.stations.find((st) => st.zone === zone)!;
      // The middle of the station's back edge: the rect side farthest from the road along `facing`.
      const back = {
        x: first.facing.x > 0.5 ? first.rect.maxX : first.facing.x < -0.5 ? first.rect.minX : first.center.x,
        z: first.facing.z > 0.5 ? first.rect.maxZ : first.facing.z < -0.5 ? first.rect.minZ : first.center.z,
      };
      expect(s.x).toBeCloseTo(back.x);
      expect(s.z).toBeCloseTo(back.z);
      expect(stationBackEdge(first)).toEqual({ x: s.x, z: s.z });
      // Outside the road: farther from the road centerline (the spur start) than half the road width.
      expect(Math.abs((s.x - first.from.x) * first.facing.x + (s.z - first.from.z) * first.facing.z)).toBeGreaterThan(LIBRARY_FLOOR.road / 2);
      expect(s.color).toBe(ZONE_TONE[zone]);
      expect(s.y - signPlate(s).h / 2).toBeCloseTo(L4_SIGN.bottom);
    }
    expect(L4_SIGN.bottom).toBeGreaterThan(ROVER_HEIGHT);
  });

  it("names each bay's track in upper case over the bay's back edge, off the road, in the zone sign type on the one L4 height", () => {
    expect(library.bays.length).toBeGreaterThan(0);
    const signs = ofKind("track");
    expect(signs).toHaveLength(library.bays.length);
    signs.forEach((s, i) => {
      const bay = library.bays[i];
      expect(s.text).toBe(tracks.get(bay.track)!.toUpperCase());
      expect({ x: s.x, z: s.z }).toEqual(stationBackEdge(bay));
      expect(Math.abs((s.x - bay.from.x) * bay.facing.x + (s.z - bay.from.z) * bay.facing.z)).toBeGreaterThan(LIBRARY_FLOOR.road / 2);
      expect([s.fontSize, s.letterSpacing]).toEqual([ZONE_SIGN.fontSize, ZONE_SIGN.letterSpacing]);
      expect(s.y - signPlate(s).h / 2).toBeCloseTo(L4_SIGN.bottom);
    });
  });

  it("titles each bay's lead over its cover, 1.6 u under the L4 height and above the cover", () => {
    const signs = ofKind("lead");
    expect(signs).toHaveLength(library.bays.length);
    signs.forEach((s, i) => {
      const lead = baySlots(library.bays[i])[0];
      expect(lead.slug).toBe(library.bays[i].posts[0]);
      expect([s.x, s.z]).toEqual([lead.at.x, lead.at.z]);
      expect(s.text.replace(/\n/g, " ")).toBe(titles.get(lead.slug));
      expect(wrapped(s.text, TITLE_SIGN.wrap)).toBe(true);
      expect(s.y - signPlate(s).h / 2).toBeCloseTo(L4_SIGN.bottom - 1.6);
      expect(s.y - signPlate(s).h / 2).toBeGreaterThan(lead.y + SHELF_PLINTH + lead.h);
    });
  });

  it("titles every spine (not the leads) just over its spine", () => {
    const signs = ofKind("spine");
    const spines = library.bays.flatMap((b) => baySlots(b).slice(1));
    expect(spines.length).toBeGreaterThan(0);
    expect(signs).toHaveLength(spines.length);
    signs.forEach((s, i) => {
      const slot = spines[i];
      expect([s.x, s.z]).toEqual([slot.at.x, slot.at.z]);
      expect(s.text.replace(/\n/g, " ")).toBe(titles.get(slot.slug));
      expect(wrapped(s.text, 22)).toBe(true);
      expect(s.y - signPlate(s).h / 2).toBeCloseTo(slot.y + slot.h + SHELF_SIGN.lift);
    });
  });

  it("lists sections, tracks, leads and spines with their kind and room; no text repeats", () => {
    const { signs, meta } = all;
    expect(signs).toHaveLength(meta.length);
    const texts = signs.map((s) => s.text.replace(/\n/g, " ").toUpperCase());
    expect(new Set(texts).size).toBe(texts.length);
    expect(meta.filter((m) => m.kind === "section")).toHaveLength(zoneSignSpecs(library, zones).length);
    expect(meta.filter((m) => m.kind === "track").map((m) => m.room)).toEqual(library.bays.map((b) => b.room));
    expect(meta.filter((m) => m.kind === "lead").map((m) => m.room)).toEqual(library.bays.map((b) => roomOfPost(b.posts[0])));
    expect(meta.filter((m) => m.kind === "spine").map((m) => m.room)).toEqual(library.bays.flatMap((b) => b.posts.slice(1).map((p) => roomOfPost(p))));
    // The featured stage keeps its title on the headline wall: no lead sign over the stage.
    expect(signs.some((s) => s.x === featured.center.x && s.z === featured.center.z)).toBe(false);
  });
});
