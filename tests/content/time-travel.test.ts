import { describe, expect, it } from "vitest";
import data from "../../content/site-content.json";
import { SiteContentSchema, TIME_TRAVEL_CAPTION_MAX } from "@/content/schema";

const content = SiteContentSchema.parse(data);
const stops = content.floors.careerArchive.timeTravel?.stops ?? [];

describe("time travel stops (owner approved 2026-10-25)", () => {
  it("has the prologue and one stop per year from 2019 to 2026, in order", () => {
    expect(stops.map((s) => s.id)).toEqual(["pre-2019", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"]);
  });

  it("keeps every caption short, bilingual and free of em dashes", () => {
    for (const stop of stops) {
      for (const locale of ["en", "id"] as const) {
        const text = stop.caption[locale];
        expect(text.length, `${stop.id} ${locale}`).toBeGreaterThan(0);
        expect(text.length, `${stop.id} ${locale}`).toBeLessThanOrEqual(TIME_TRAVEL_CAPTION_MAX);
        expect(text, `${stop.id} ${locale}`).not.toContain("\u2014");
      }
    }
  });

  it("lists at most three highlights per stop", () => {
    for (const stop of stops) expect(stop.highlights.length, stop.id).toBeLessThanOrEqual(3);
  });

  it("rejects an unknown stop id and a fourth highlight", () => {
    type Mutable = { floors: { careerArchive: { timeTravel: { stops: { id: string; highlights: unknown[] }[] } } } };
    const bad = structuredClone(data) as unknown as Mutable;
    bad.floors.careerArchive.timeTravel.stops[0].id = "1999-ish";
    expect(SiteContentSchema.safeParse(bad).success).toBe(false);
    const many = structuredClone(data) as unknown as Mutable;
    many.floors.careerArchive.timeTravel.stops[1].highlights = Array.from({ length: 4 }, () => ({ kind: "entry", id: "shumi-2019" }));
    expect(SiteContentSchema.safeParse(many).success).toBe(false);
  });
});
