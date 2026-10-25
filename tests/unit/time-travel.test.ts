import { describe, expect, it } from "vitest";
import data from "../../content/site-content.json";
import { SiteContentSchema, type SiteContent } from "@/content/schema";
import { buildTimeTravel, expectedStopIds, stopIdOf, TALLY_KEYS } from "@/content/time-travel";

const real = SiteContentSchema.parse(data);

function withStops(content: SiteContent, ids: string[]): SiteContent {
  const copy = structuredClone(content);
  copy.floors.careerArchive.timeTravel = { stops: ids.map((id) => ({ id, caption: { en: `c ${id}`, id: `c ${id}` }, highlights: [] })) };
  return copy;
}

describe("time travel derivation", () => {
  it("puts years before 2019 in the prologue", () => {
    expect(stopIdOf(2016)).toBe("pre-2019");
    expect(stopIdOf(2018)).toBe("pre-2019");
    expect(stopIdOf(2019)).toBe("2019");
  });

  it("expects the prologue and every year from 2019 to the latest item", () => {
    expect(expectedStopIds(real)).toEqual(["pre-2019", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"]);
  });

  it("returns nothing without a timeTravel field", () => {
    const copy = structuredClone(real);
    delete copy.floors.careerArchive.timeTravel;
    expect(buildTimeTravel(copy)).toEqual([]);
  });

  it("counts awards from the awards list only, never the award entries", () => {
    const stops = buildTimeTravel(real);
    const awardsTotal = stops.reduce((sum, s) => sum + s.counts.awards, 0);
    expect(awardsTotal).toBe(real.awards.length);
    const entryAwards = real.floors.careerArchive.entries.filter((e) => e.type === "award").length;
    const allRoleStudy = stops.reduce((sum, s) => sum + s.counts.roles + s.counts.study, 0);
    expect(allRoleStudy).toBe(real.floors.careerArchive.entries.length - entryAwards);
  });

  it("accumulates the tally with what each stop added", () => {
    const stops = buildTimeTravel(real);
    for (const key of TALLY_KEYS) {
      let running = 0;
      for (const stop of stops) {
        running += stop.tally[key].added;
        expect(stop.tally[key].total, `${stop.id} ${key}`).toBe(running);
      }
    }
    const last = stops.at(-1)!;
    expect(last.tally.projects.total).toBe(real.floors.labs.pods.length + real.sideProjects.length);
    expect(last.tally.certs.total).toBe(real.certifications.length);
  });

  it("scales building heights by the square root, the largest at 1", () => {
    const stops = buildTimeTravel(real);
    const max = Math.max(...stops.map((s) => s.size));
    for (const s of stops) expect(s.height).toBeCloseTo(Math.sqrt(s.size) / Math.sqrt(max), 6);
    expect(Math.max(...stops.map((s) => s.height))).toBe(1);
  });

  it("links the prologue to the 2019 rows and each year to its own", () => {
    const stops = buildTimeTravel(real);
    expect(stops[0]).toMatchObject({ id: "pre-2019", year: null, anchor: "y2019" });
    expect(stops[3]).toMatchObject({ id: "2021", year: 2021, anchor: "y2021" });
  });

  it("resolves highlights to labels and hrefs", () => {
    const byId = Object.fromEntries(buildTimeTravel(real).map((s) => [s.id, s]));
    const entry = real.floors.careerArchive.entries.find((e) => e.id === "shumi-2019")!;
    const pod = real.floors.labs.pods.find((p) => p.id === "payments-realtime-backend")!;
    expect(byId["2019"].highlights[1]).toEqual({ kind: "entry", label: entry.role, href: `/journey/${entry.slug}` });
    expect(byId["2022"].highlights[1].href).toBe(`/labs/${pod.slug}`);
    expect(byId["2021"].highlights[1].href).toBe("/library#research");
    expect(byId["2026"].highlights[2]).toMatchObject({ kind: "cert", href: "/contact#certifications" });
  });

  it("throws on an unknown highlight id", () => {
    const copy = withStops(real, expectedStopIds(real));
    copy.floors.careerArchive.timeTravel!.stops[2].highlights = [{ kind: "pod", id: "no-such-pod" }];
    expect(() => buildTimeTravel(copy)).toThrow(/no-such-pod/);
  });
});
