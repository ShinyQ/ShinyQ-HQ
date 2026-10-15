import { describe, expect, it } from "vitest";
import type { RoomId } from "@/content/schema";
import { buildExperienceData } from "@/content/experience";
import { FLOOR_COLOR } from "@/experience/config";
import { yearMarkerSigns, YEAR_MARKER } from "@/experience/floors/career/labels";
import { buildCareerRoad, CAREER_ROAD, careerLayoutInput } from "@/experience/floors/career/layout";
import { L4_SIGN, TITLE_SIGN, YEAR_POST, librarySigns, stationTitleSpecs, yearPostSegments, yearPostSpecs, zoneSignSpecs } from "@/experience/floors/library/decor/signs";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { DOCK, LIBRARY_FLOOR, libraryLayoutInput, ZONE_TONE } from "@/experience/floors/library/model";
import { signPlate } from "@/experience/fx/signLayout";
import { ROVER_HEIGHT } from "@/experience/config";

const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
const career = buildCareerRoad(careerLayoutInput(data.career));
const library = buildLibraryLayout(libraryLayoutInput(data.library));
const zones = { blog: "Blog", research: "Research", models: "Models and datasets", talks: "Talks and workshops" };

describe("L2 floating year markers (they used to be painted on the plazas)", () => {
  const signs = yearMarkerSigns(career.years, FLOOR_COLOR.L2);

  it("floats one big year in the floor accent behind each plaza's north room row, never between the rail camera and the road", () => {
    expect(signs.map((s) => s.text)).toEqual(career.years.map((y) => String(y.year)));
    signs.forEach((s, i) => {
      const y = career.years[i];
      expect(s.x).toBe(y.plaza.center.x);
      expect(s.z).toBe(y.plaza.center.z - CAREER_ROAD.plazaDepth / 2 - CAREER_ROAD.apron - CAREER_ROAD.roomDepth - YEAR_MARKER.behind);
      // Behind every north room of its year (the rail camera looks north from the south).
      for (const room of career.rooms.filter((r) => r.year === y.year && r.side < 0)) expect(s.z).toBeLessThan(room.center.z - room.d / 2);
      // Over the slab.
      expect(s.z).toBeGreaterThan(career.bounds.minZ);
      expect(s.color).toBe(FLOOR_COLOR.L2);
      expect(s.fontSize).toBe(YEAR_MARKER.fontSize);
      expect(s.fadeX).toBe(y.plaza.center.x);
      expect(s.y - signPlate(s).h / 2).toBeCloseTo(YEAR_MARKER.bottom);
    });
  });
});

describe("L4 floating signs (Round 7 F: one height rule)", () => {
  const titles = new Map(data.library.posts.map((p) => [`L4:${p.slug}`, p.title])) as unknown as Map<RoomId, string>;
  const featured = library.stations[0];
  const titled = library.stations.filter((s) => s !== featured);

  it("floats one sign per present zone at its entrance, plate bottom on the one L4 height", () => {
    const signs = zoneSignSpecs(library, zones);
    expect(signs).toHaveLength(new Set(library.stations.map((s) => s.zone)).size);
    for (const s of signs) {
      const zone = (Object.keys(zones) as (keyof typeof zones)[]).find((z) => zones[z].toUpperCase() === s.text)!;
      expect([s.x, s.z]).toEqual([library.signs[zone].at.x, library.signs[zone].at.z]);
      expect(s.color).toBe(ZONE_TONE[zone]);
      expect(s.y - signPlate(s).h / 2).toBeCloseTo(L4_SIGN.bottom);
    }
    expect(L4_SIGN.bottom).toBeGreaterThan(ROVER_HEIGHT);
  });

  it("titles only the post stations (shelves keep their zone sign alone), on the same height", () => {
    const signs = stationTitleSpecs(titled, titles);
    const posts = titled.filter((s) => s.zone === "blog");
    expect(signs).toHaveLength(posts.length);
    signs.forEach((s, i) => {
      expect([s.x, s.z]).toEqual([posts[i].center.x, posts[i].center.z]);
      expect(s.text.replace(/\n/g, " ")).toBe(titles.get(posts[i].room));
      expect(s.text.split("\n").every((l) => l.length <= TITLE_SIGN.wrap || !l.includes(" "))).toBe(true);
      expect(s.y - signPlate(s).h / 2).toBeCloseTo(L4_SIGN.bottom);
    });
  });

  it("puts every year on a low post at the road edge, in the gap before its first post", () => {
    const years = library.extras.years ?? [];
    expect(years.length).toBeGreaterThan(0);
    const signs = yearPostSpecs(years);
    const posts = yearPostSegments(years);
    signs.forEach((s, i) => {
      expect(s.text).toBe(years[i].year);
      expect(Math.abs(s.z)).toBeCloseTo(LIBRARY_FLOOR.road / 2 + YEAR_POST.edge);
      expect(s.y - signPlate(s).h / 2).toBeCloseTo(YEAR_POST.top);
      expect(s.y + signPlate(s).h / 2).toBeLessThan(ROVER_HEIGHT);
      expect(posts[i]).toEqual([s.x, 0, s.z, s.x, YEAR_POST.top, s.z]);
      // Off every station and spur.
      for (const st of library.stations) {
        expect(s.x < st.rect.minX || s.x > st.rect.maxX || s.z < st.rect.minZ || s.z > st.rect.maxZ).toBe(true);
        expect(Math.abs(s.x - st.from.x)).toBeGreaterThan(DOCK.spurWidth / 2);
      }
    });
  });

  it("lists sections, years and titles once each, with their kind; no title repeats a zone name", () => {
    const { signs, meta } = librarySigns({ layout: library, zones, titles, titled });
    expect(signs).toHaveLength(meta.length);
    const texts = signs.map((s) => s.text.replace(/\n/g, " ").toUpperCase());
    expect(new Set(texts).size).toBe(texts.length);
    expect(meta.filter((m) => m.kind === "section")).toHaveLength(zoneSignSpecs(library, zones).length);
    expect(meta.filter((m) => m.kind === "title").every((m) => m.zone === "blog" && m.room)).toBe(true);
    expect(meta.some((m) => m.kind === "title" && m.room === featured.room)).toBe(false);
  });
});
