import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { resultBars } from "@/content/highlights";
import { HEADER } from "@/experience/floors/lobby/hallContent";
import { HALL, HALL_LAYOUT } from "@/experience/floors/lobby/hallLayout";
import { barLengths, CENTRE, centres, PART_OF, premiumInstances, premiumTexts, REPLACES, sectorNodes, spireRings } from "@/experience/floors/lobby/hallPremium/build";
import { ACCENT, accentOf, caseFrame } from "@/experience/floors/lobby/hallPremium/caseFrame";
import { PREMIUM_MODE } from "@/experience/floors/lobby/hallPremium/shader";
import { onPad } from "@/experience/nav/doors";

const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });

describe("hall interiors: case frames (owner decision 2026-11-04)", () => {
  it("fits every case inside its station footprint and keeps the door pad clear", () => {
    HALL_LAYOUT.stations.forEach((s, i) => {
      const { box } = caseFrame(s, "full");
      expect(box.minX).toBeGreaterThanOrEqual(s.rect.minX - 1e-6);
      expect(box.maxX).toBeLessThanOrEqual(s.rect.maxX + 1e-6);
      expect(box.minZ).toBeGreaterThanOrEqual(s.rect.minZ - 1e-6);
      expect(box.maxZ).toBeLessThanOrEqual(s.rect.maxZ + 1e-6);
      const padInside = s.pad.x >= box.minX && s.pad.x <= box.maxX && s.pad.z >= box.minZ && s.pad.z <= box.maxZ;
      expect(padInside, s.station).toBe(false);
      expect(onPad(HALL_LAYOUT.doors[i], s.pad)).toBe(true);
    });
  });

  it("alternates the accents cyan and violet by station number", () => {
    expect(HALL_LAYOUT.stations.map(accentOf)).toEqual([ACCENT.cyan, ACCENT.violet, ACCENT.cyan, ACCENT.violet, ACCENT.cyan, ACCENT.violet, ACCENT.cyan]);
  });

  it("gives every station four quiet glass panes under its header, each tied to its wake slot", () => {
    for (const s of HALL_LAYOUT.stations) {
      const f = caseFrame(s, "lite");
      expect(f.panes).toHaveLength(4);
      expect(f.box.h).toBeCloseTo(HALL.height[s.station] + HEADER.over);
      for (const i of f.panes) {
        expect(i.a[0]).toBe(PREMIUM_MODE.pane);
        expect(i.a[3]).toBe(HALL_LAYOUT.stations.indexOf(s) + 1);
        expect(i.b[3]).toBeLessThanOrEqual(0.6);
      }
    }
  });
});

describe("hall interiors: instances and texts", () => {
  it("draws each part's interiors in one mesh, every station in its part", () => {
    const parts = premiumInstances(data, "full");
    const stationsIn = (list: (typeof parts)["north"]) => new Set(list.map((i) => i.a[3]).filter((n) => n > 0));
    for (const [part, list] of Object.entries(parts)) {
      const expected = HALL_LAYOUT.stations.filter((s) => PART_OF[s.station] === part).map((s) => HALL_LAYOUT.stations.indexOf(s) + 1);
      expect([...stationsIn(list)].sort()).toEqual(expected.sort());
    }
  });

  it("orbits one token per award and honor; still on lite", () => {
    const wins = HALL_LAYOUT.stations.findIndex((s) => s.station === "wins") + 1;
    const tokens = (tier: "full" | "lite") => premiumInstances(data, tier).north.filter((i) => i.a[0] === PREMIUM_MODE.token && i.a[3] === wins);
    expect(tokens("full")).toHaveLength(data.highlights.wins.placings);
    expect(tokens("full").some((t) => t.b[1] !== 0)).toBe(true);
    expect(tokens("lite").every((t) => t.b[1] === 0)).toBe(true);
  });

  it("bars only the results that parse, proportional within each", () => {
    const parsed = data.highlights.results.filter((r) => resultBars(r.value)).length;
    const results = HALL_LAYOUT.stations.findIndex((s) => s.station === "results") + 1;
    const bars = premiumInstances(data, "full").south.filter((i) => i.a[0] === PREMIUM_MODE.bar && i.a[3] === results);
    // Two bars per parsed result, plus the header underline.
    expect(bars).toHaveLength(Math.min(parsed, 9) * 2 + 1);
    const [b, a] = barLengths({ before: 90.9, after: 36.4, scale: "linear" }, 1);
    expect(b).toBe(1);
    expect(a).toBeCloseTo(36.4 / 90.9);
    const [lb, la] = barLengths({ before: 11_700, after: 156, scale: "log" }, 1);
    expect(lb).toBe(1);
    expect(la).toBeGreaterThan(0.2);
    expect(la).toBeLessThan(0.5);
  });

  it("adds the projects' headline metrics, the live badges and the centrepieces' texts, replacing no station text", () => {
    const fonts = { sans: "s", sansBold: "sb", mono: "m", monoBold: "mb" };
    const texts = premiumTexts(data, { impactOrbit: "Impact Orbit", signalSpire: "Signal Spire", live: "Live" } as never, fonts);
    expect(REPLACES).toEqual([]);
    expect(texts.filter((t) => t.text === "LIVE")).toHaveLength(Math.min(2, data.highlights.now.length));
    for (const sector of data.highlights.sectors) expect(texts.map((t) => t.text)).toContain(sector);
    for (const y of data.career.years) expect(texts.filter((t) => t.text === String(y.year))).toHaveLength(4);
    expect(texts.filter((t) => t.text === "IMPACT ORBIT")).toHaveLength(4);
    for (const t of texts) expect(t.text).not.toContain("\u2014");
  });
});

describe("hall interiors: the floor's life (owner, 2026-11-04)", () => {
  const parts = premiumInstances(data, "full");
  const all = [...parts.north, ...parts.contact, ...parts.south];
  it("lays inlay rings, rib and gate glows, and a pool and a pulse path per station, all lying on the floor", () => {
    const floor = all.filter((i) => i.c[2] === 1 && i.at[1] < 0.1);
    expect(floor.filter((i) => i.a[0] === PREMIUM_MODE.path)).toHaveLength(HALL_LAYOUT.stations.length);
    expect(floor.filter((i) => i.a[0] === PREMIUM_MODE.pool)).toHaveLength(HALL_LAYOUT.stations.length + 3);
    for (const i of floor.filter((x) => x.a[0] === PREMIUM_MODE.path || x.a[0] === PREMIUM_MODE.pool)) {
      expect(i.c[2]).toBe(1);
      expect(i.at[1]).toBeLessThan(0.1);
    }
    // Each station's path ends on its door pad and wakes with it.
    for (const s of HALL_LAYOUT.stations) {
      const p = all.find((i) => i.a[0] === PREMIUM_MODE.path && i.c[2] === 1 && i.at[1] < 0.1 && i.a[3] === HALL_LAYOUT.stations.indexOf(s) + 1)!;
      const end = { x: p.at[0] + (Math.cos(p.yaw) * p.a[1]) / 2, z: p.at[2] - (Math.sin(p.yaw) * p.a[1]) / 2 };
      expect(end.x).toBeCloseTo(s.pad.x);
      expect(end.z).toBeCloseTo(s.pad.z);
    }
  });
});

describe("hall interiors: the centrepieces (owner, 2026-11-04)", () => {
  it("stands the Impact Orbit and the Signal Spire on the spine in the middle of each plaza half, light only", () => {
    const { orbit, spire } = centres();
    expect(orbit.x).toBe(HALL.plaza.x);
    expect(spire.x).toBe(HALL.plaza.x);
    expect(orbit.z).toBeLessThan(HALL.lead[0].z + 6);
    expect(spire.z).toBeGreaterThan(HALL.lead[0].z + 6);
    for (const o of HALL_LAYOUT.obstacles) for (const c of [orbit, spire]) expect(c.x > o.minX && c.x < o.maxX && c.z > o.minZ && c.z < o.maxZ).toBe(false);
  });
  it("draws a ring per career year, the current year on top and brightest, and fewer globe points on lite", () => {
    const rings = spireRings(data.career.years);
    expect(rings.map((r) => r.year)).toEqual(data.career.years.map((y) => y.year));
    for (let i = 1; i < rings.length; i++) expect(rings[i].y).toBeGreaterThan(rings[i - 1].y);
    expect(rings.at(-1)!.alpha).toBe(Math.max(...rings.map((r) => r.alpha)));
    const points = (tier: "full" | "lite") => premiumInstances(data, tier).north.filter((i) => i.a[3] === 0 && i.a[0] === PREMIUM_MODE.token && i.a[1] === 0.1).length;
    expect(points("full")).toBe(CENTRE.orbit.points.full);
    expect(points("lite")).toBe(CENTRE.orbit.points.lite);
    expect(premiumInstances(data, "lite").north.filter((i) => i.a[3] === 0).every((i) => i.b[1] === 0)).toBe(true);
  });
  it("names every sector by its label only (C3), never a client", () => {
    expect(data.highlights.sectors.length).toBeGreaterThan(0);
    expect(new Set(data.highlights.sectors).size).toBe(data.highlights.sectors.length);
    expect(sectorNodes(data.highlights.sectors)).toHaveLength(data.highlights.sectors.length);
  });
});
