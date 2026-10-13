import { describe, expect, it } from "vitest";
import { buildRoofLayout, ROOF_DECK } from "@/experience/floors/roof/layout";
import { globeInstances, OBSERVATORY, observatoryParts, observatoryText, type ObservatoryLabels } from "@/experience/floors/roof/observatory";
import { STATS_FIXTURE } from "@/lib/visits/contract";
import { landCells } from "@/lib/visits/geo";
import { visitsView } from "@/lib/visits/model";

const layout = buildRoofLayout();
const labels: ObservatoryLabels = {
  title: "Visitor Observatory",
  offline: "Stats offline",
  approx: (n) => `about ${n}`,
  visits30: "visits, last 30 days",
  visitsAll: "since launch",
  countries: "countries",
  questions: "questions asked",
  topFloor: (f) => `most explored: ${f}`,
  split: (a, b) => `3D ${a}% · Classic ${b}%`,
  source: "Cloudflare Web Analytics, sampled estimates",
  updated: "Updated daily",
  delayed: (d) => `Delayed: last updated ${d}`,
  floors: { L1: "Home", L2: "Journey", L3: "Work", L4: "Writing", RF: "About" },
};
const inside = (x: number, z: number) => x >= layout.visits.minX && x <= layout.visits.maxX && z >= layout.visits.minZ && z <= layout.visits.maxZ;

describe("Visitor Observatory parts", () => {
  it("keeps the globe, the panel and the solids on the station footprint, under the camera column", () => {
    const p = observatoryParts(layout);
    expect(inside(p.globe.x, p.globe.z)).toBe(true);
    expect(p.globe.y + p.globe.r).toBeLessThanOrEqual(ROOF_DECK.visitsHeight);
    expect(p.globe.x + p.globe.r).toBeLessThanOrEqual(layout.visits.maxX);
    expect(p.globe.z - p.globe.r).toBeGreaterThanOrEqual(layout.visits.minZ);
    for (const b of p.solids) expect(inside(b.x, b.z)).toBe(true);
    // The panel faces the plaza side (south), never the slab edge.
    expect(Math.cos(p.panel.yaw)).toBeGreaterThan(0.8);
    expect(p.panel.bottom + p.panel.h).toBeLessThanOrEqual(ROOF_DECK.visitsHeight);
  });

  it("places one land dot per land cell (half on lite) and one dot per known country", () => {
    const full = globeInstances(OBSERVATORY.globeRadius, "full", ["ID", "US", "ZZ"]);
    expect(full.land.count).toBe(landCells().length);
    expect(globeInstances(OBSERVATORY.globeRadius, "lite", []).land.count).toBe(landCells(2).length);
    expect(full.countries.count).toBe(2);
    // Every land dot sits on the sphere (instance matrix translation).
    const m = full.land.matrices;
    for (let i = 0; i < full.land.count; i += 97) expect(Math.hypot(m[i * 16 + 12], m[i * 16 + 13], m[i * 16 + 14])).toBeCloseTo(OBSERVATORY.globeRadius * 1.005, 2);
    // Two triangles per dot: well under the RF triangle budget.
    expect((full.land.count + full.countries.count) * 2).toBeLessThan(3000);
  });

  it("writes the numbers with the window, the source and the cadence", () => {
    const rows = observatoryText(observatoryParts(layout), { view: visitsView(STATS_FIXTURE, "d30", "all"), allVisits: STATS_FIXTURE.visits.all, freshness: "fresh", lastDay: "13 Oct 2026" }, labels, "en");
    const text = rows.map((r) => r.text);
    expect(text).toEqual([
      "VISITOR OBSERVATORY",
      "about 340",
      "visits, last 30 days",
      "about 520 since launch",
      "9 countries · 64 questions asked",
      "most explored: Work",
      "3D 68% · Classic 32%",
      "Cloudflare Web Analytics, sampled estimates",
      "Updated daily",
    ]);
    expect(rows.every((r) => r.yaw === observatoryParts(layout).panel.yaw)).toBe(true);
  });

  it("notes a delayed snapshot and shows the offline state without data", () => {
    const parts = observatoryParts(layout);
    const delayed = observatoryText(parts, { view: visitsView(STATS_FIXTURE, "d30", "all"), allVisits: STATS_FIXTURE.visits.all, freshness: "delayed", lastDay: "13 Oct 2026" }, labels, "en");
    expect(delayed.at(-1)?.text).toBe("Delayed: last updated 13 Oct 2026");
    expect(delayed.at(-2)?.text).toBe(labels.source);
    const offline = observatoryText(parts, null, labels, "en").map((r) => r.text);
    expect(offline).toEqual(["VISITOR OBSERVATORY", "Stats offline", "", "", "", "", "", "", ""]);
  });
});
