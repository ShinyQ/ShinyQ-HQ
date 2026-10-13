import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { getSideProjects, getYears } from "@/content/load";
import { FLOOR_COLOR } from "@/experience/config";
import { yearMarkerSigns, YEAR_MARKER } from "@/experience/floors/career/labels";
import { buildCareerRoad, CAREER_ROAD } from "@/experience/floors/career/layout";
import { YEAR_MARK, yearMarkSigns, ZONE_SIGN, zoneSignSpecs } from "@/experience/floors/library/decor/signs";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { libraryLayoutInput, ZONE_TONE } from "@/experience/floors/library/model";
import { signPlate } from "@/experience/fx/signLayout";
import { ROVER_HEIGHT } from "@/experience/config";

const career = buildCareerRoad({
  years: getYears().map(({ year, entries }) => ({ year, entries: entries.map((e) => ({ slug: e.slug, type: e.type })) })),
  benches: getSideProjects().length,
});
const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
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

describe("L4 floating signs", () => {
  it("floats a zone sign where each present zone's road starts, above the rover", () => {
    const signs = zoneSignSpecs(library, zones);
    const present = new Set(library.stations.map((s) => s.zone));
    expect(signs).toHaveLength(present.size);
    for (const s of signs) {
      const zone = (Object.keys(zones) as (keyof typeof zones)[]).find((z) => zones[z].toUpperCase() === s.text)!;
      expect(s.x).toBe(library.signs[zone].at.x);
      expect(s.z).toBe(library.signs[zone].at.z);
      expect(s.color).toBe(ZONE_TONE[zone]);
      expect(s.y - signPlate(s).h / 2).toBeCloseTo(ZONE_SIGN.bottom);
      expect(ZONE_SIGN.bottom).toBeGreaterThan(ROVER_HEIGHT);
    }
  });

  it("floats the newsroom's timeline years over their marks", () => {
    const years = library.extras.years ?? [];
    const signs = yearMarkSigns(years);
    expect(signs.map((s) => s.text)).toEqual(years.map((y) => y.year));
    signs.forEach((s, i) => {
      expect([s.x, s.z]).toEqual([years[i].at.x, years[i].at.z]);
      expect(s.y - signPlate(s).h / 2).toBeCloseTo(YEAR_MARK.bottom);
      expect(YEAR_MARK.bottom).toBeGreaterThan(ROVER_HEIGHT);
    });
  });
});
