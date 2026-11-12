import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { beforeAfterResults, currentRoles, WIN_TIERS, winCounts, winTier, winTiers } from "@/content/highlights";
import { getAwards, getPods, getTimeline } from "@/content/load";
import { buildFloorLayouts, LOBBY, ROVER } from "@/experience/config";
import { gateStartRoom, highlightsRoomFromHash } from "@/experience/floors/lobby/stations";
import { WEST_STRIP, westStripLights } from "@/experience/floors/lobby/westStripLayout";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { inSlab } from "@/experience/nav/slab";

/**
 * The Highlights Hall's new stations (owner decision 2026-11-02): every number derived from the content, nothing typed in.
 * Wins from `awards`, results only from verified before and after case study results, now from the roles still running.
 */
describe("Highlights Hall station data", () => {
  const awards = getAwards();

  it("tiers every award by its placement: 1st, 2nd and 3rd place, then every other placing as an honor", () => {
    expect(winTier("1st place")).toBe("gold");
    expect(winTier("2nd place")).toBe("silver");
    expect(winTier("3rd place")).toBe("bronze");
    for (const p of ["Finalist", "Top 100", "Favorite winner"]) expect(winTier(p)).toBe("honor");
    const tiers = winTiers(awards);
    expect(tiers.map((t) => t.tier)).toEqual([...WIN_TIERS]);
    expect(tiers.reduce((n, t) => n + t.awards.length, 0)).toBe(awards.length);
    for (const t of tiers) for (let i = 1; i < t.awards.length; i++) expect(t.awards[i - 1].date >= t.awards[i].date).toBe(true);
    expect(tiers.map((t) => t.awards.length)).toEqual(WIN_TIERS.map((tier) => awards.filter((a) => winTier(a.placement.en) === tier).length));
    expect(winCounts(awards)).toEqual({ placings: awards.length, firsts: tiers[0].awards.length });
  });

  it("shows only verified results that read as a before and after, each with its case study, in site order", () => {
    const list = beforeAfterResults();
    expect(list.length).toBeGreaterThan(0);
    for (const { pod, result } of list) {
      expect(result.confidence).toBe("verified");
      expect(result.value).toMatch(/→|\sto\s/);
      expect(pod.results).toContain(result);
    }
    // Every verified impact result with a numeric before and after (`delta`) is there, in site order; side-by-side
    // comparisons ("6 vs 18") and a non-numeric before ("Not run") stay out.
    const all = getPods().flatMap((pod) => pod.results.filter((r) => r.confidence === "verified" && r.kind !== "scale" && r.delta && /\d/.test(r.delta.before) && /\d/.test(r.delta.after)));
    expect(list.map((r) => r.result)).toEqual(all);
    expect(list.some(({ result }) => / vs /.test(result.value))).toBe(false);
  });

  it("lists the roles still running, employment first", () => {
    const roles = currentRoles();
    expect(roles.length).toBeGreaterThan(0);
    for (const r of roles) expect(r.end).toBe("present");
    const running = getTimeline().filter((e) => e.end === "present" && (e.type === "job" || e.type === "freelance"));
    expect(roles.map((r) => r.slug).sort()).toEqual(running.map((e) => e.slug).sort());
    const firstFreelance = roles.findIndex((r) => r.type === "freelance");
    if (firstFreelance >= 0) expect(roles.slice(firstFreelance).every((r) => r.type === "freelance")).toBe(true);
  });

  it("ships the counts, results and roles in the 3D payload (both locales)", () => {
    for (const locale of ["en", "id"] as const) {
      const { highlights } = buildExperienceData(locale, { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
      expect(highlights.wins.placings).toBe(awards.length);
      expect(highlights.wins.tiers.map((t) => t.count)).toEqual(winTiers(awards).map((t) => t.awards.length));
      expect(highlights.results.map((r) => r.value)).toEqual(beforeAfterResults().map((r) => r.result.value));
      expect(highlights.results.map((r) => r.label)).toEqual(beforeAfterResults().map((r) => r.result.label[locale]));
      expect(highlights.now.map((r) => r.slug)).toEqual(currentRoles().map((r) => r.slug));
    }
  });

  it("deep links the new stations like the others (#highlights-<station>)", () => {
    for (const s of ["wins", "now", "results"]) {
      expect(highlightsRoomFromHash(`#highlights-${s}`)).toBe(`L1:highlights-${s}`);
      expect(gateStartRoom(undefined, undefined, `#highlights-${s}`)).toBe(`L1:highlights-${s}`);
    }
    // The cancelled park links open nothing.
    for (const h of ["#park", "#park-city", "#park-wins"]) expect(gateStartRoom(undefined, undefined, h)).toBeUndefined();
  });
});

describe("the lit strip west of the Agent Office", () => {
  const l1 = buildFloorLayouts(8).L1;

  it("is light only: columns and pools inside the strip, no obstacle, the floor still open", () => {
    const lights = westStripLights();
    expect(lights.length).toBeGreaterThan(0);
    const grid = buildNavGrid(l1, ROVER.radius);
    for (const l of lights) {
      expect(l.x).toBeGreaterThan(WEST_STRIP.rect.minX);
      expect(l.x).toBeLessThan(WEST_STRIP.rect.maxX);
      expect(l.z).toBeGreaterThan(WEST_STRIP.rect.minZ);
      expect(l.z).toBeLessThan(WEST_STRIP.rect.maxZ);
      expect(l.alpha).toBeLessThanOrEqual(0.6);
      expect(inSlab({ x: l.x, z: l.z }, l1)).toBe(true);
      expect(isWalkable(grid, { x: l.x, z: l.z })).toBe(true);
    }
    expect(WEST_STRIP.rect.maxX).toBe(LOBBY.officeWing.rect.minX);
  });
});
