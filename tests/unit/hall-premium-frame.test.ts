import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { resultBars } from "@/content/highlights";
import { HEADER } from "@/experience/floors/lobby/hallContent";
import { HALL, HALL_LAYOUT } from "@/experience/floors/lobby/hallLayout";
import { barLengths, PART_OF, premiumInstances, premiumTexts, REPLACES } from "@/experience/floors/lobby/hallPremium/build";
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
    const stationsIn = (list: (typeof parts)["north"]) => new Set(list.map((i) => i.a[3]));
    for (const [part, list] of Object.entries(parts)) {
      const expected = HALL_LAYOUT.stations.filter((s) => PART_OF[s.station] === part).map((s) => HALL_LAYOUT.stations.indexOf(s) + 1);
      expect([...stationsIn(list)].sort()).toEqual(expected.sort());
    }
  });

  it("orbits one token per award and honor; still on lite", () => {
    const tokens = (tier: "full" | "lite") => premiumInstances(data, tier).north.filter((i) => i.a[0] === PREMIUM_MODE.token);
    expect(tokens("full")).toHaveLength(data.highlights.wins.placings);
    expect(tokens("full").some((t) => t.b[1] !== 0)).toBe(true);
    expect(tokens("lite").every((t) => t.b[1] === 0)).toBe(true);
  });

  it("bars only the results that parse, proportional within each", () => {
    const parsed = data.highlights.results.filter((r) => resultBars(r.value)).length;
    const bars = premiumInstances(data, "full").south.filter((i) => i.a[0] === PREMIUM_MODE.bar);
    expect(bars).toHaveLength(Math.min(parsed, 9) * 2);
    const [b, a] = barLengths({ before: 90.9, after: 36.4, scale: "linear" }, 1);
    expect(b).toBe(1);
    expect(a).toBeCloseTo(36.4 / 90.9);
    const [lb, la] = barLengths({ before: 11_700, after: 156, scale: "log" }, 1);
    expect(lb).toBe(1);
    expect(la).toBeGreaterThan(0.2);
    expect(la).toBeLessThan(0.5);
  });

  it("adds only the projects' headline metrics and replaces no station text", () => {
    const fonts = { sans: "s", sansBold: "sb", mono: "m", monoBold: "mb" };
    const texts = premiumTexts(data, {} as never, fonts);
    const metrics = data.highlights.projects.filter((p) => data.highlights.results.some((r) => r.slug === p.slug)).length;
    expect(texts).toHaveLength(metrics);
    expect(REPLACES).toEqual([]);
    for (const t of texts) expect(t.text).not.toContain("\u2014");
  });
});
