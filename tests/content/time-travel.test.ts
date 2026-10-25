import { describe, expect, it } from "vitest";
import data from "../../content/site-content.json";
import { SiteContentSchema, TIME_TRAVEL_CAPTION_MAX } from "@/content/schema";
import { buildTimeTravel, expectedStopIds } from "@/content/time-travel";
import { hasFirstPerson } from "@/lib/first-person";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

const content = SiteContentSchema.parse(data);
const stops = content.floors.careerArchive.timeTravel?.stops ?? [];

describe("time travel stops (owner approved 2026-10-25)", () => {
  it("has the prologue first and one stop per year from 2019, consecutive", () => {
    const ids = stops.map((s) => s.id);
    expect(ids[0]).toBe("pre-2019");
    const years = ids.slice(1).map(Number);
    expect(years[0]).toBe(2019);
    years.forEach((year, i) => expect(year).toBe(2019 + i));
    expect(ids).toEqual(expectedStopIds(content));
  });

  it("keeps the section title free of the first person", () => {
    expect(hasFirstPerson(en.timeTravel.title, "en")).toBe(false);
    expect(hasFirstPerson(id.timeTravel.title, "id")).toBe(false);
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

describe("time travel coverage", () => {
  it("has a stop for every year with items, so no year shows without its caption", () => {
    expect(stops.map((s) => s.id)).toEqual(expectedStopIds(content));
  });

  it("resolves every highlight", () => {
    expect(() => buildTimeTravel(content)).not.toThrow();
  });

  it("gives every highlight its own link text in both locales", () => {
    const all = buildTimeTravel(content).flatMap((s) => s.highlights);
    for (const locale of ["en", "id"] as const) {
      const labels = all.map((h) => h.label[locale]);
      expect(labels.length).toBeGreaterThan(0);
      expect(new Set(labels).size, `duplicate ${locale} labels: ${labels.join(" | ")}`).toBe(labels.length);
    }
  });
});
