import { describe, expect, it } from "vitest";
import { getPublicRepos } from "@/content/load";
import { repoSlug } from "@/content/workshop";
import {
  languageColor,
  LANGUAGE_COLORS,
  OTHER_LANGUAGE,
  SKYLINE,
  skylineBars,
  skylineHeight,
  skylineLanguages,
  skylineShape,
  spreadColumns,
  topBars,
  type WorkshopRepo,
} from "@/experience/floors/career/skyline";

const real: WorkshopRepo[] = getPublicRepos().map((r) => ({ slug: repoSlug(r.name), name: r.name, language: r.language, stars: r.stars }));

describe("skylineHeight (log scale)", () => {
  it("runs from the stub height at 0 stars to the full height at the top repo", () => {
    expect(skylineHeight(0, 21)).toBe(SKYLINE.minH);
    expect(skylineHeight(21, 21)).toBeCloseTo(SKYLINE.maxH);
    expect(skylineHeight(5, 0)).toBe(SKYLINE.minH);
  });

  it("grows with stars but flattens like a log: 1 to 2 stars adds more than 19 to 20", () => {
    const hs = [0, 1, 2, 5, 10, 19, 20, 21].map((s) => skylineHeight(s, 21));
    for (let i = 1; i < hs.length; i++) expect(hs[i]).toBeGreaterThan(hs[i - 1]);
    expect(skylineHeight(2, 21) - skylineHeight(1, 21)).toBeGreaterThan(skylineHeight(20, 21) - skylineHeight(19, 21));
    // Exactly log1p over log1p(max).
    expect(skylineHeight(10, 21)).toBeCloseTo(SKYLINE.minH + (SKYLINE.maxH - SKYLINE.minH) * (Math.log(11) / Math.log(22)));
  });
});

describe("languageColor", () => {
  it("tints known languages and falls back to white", () => {
    expect(languageColor("Python")).toBe(LANGUAGE_COLORS.Python);
    expect(languageColor("Rust")).toBe(OTHER_LANGUAGE);
    for (const r of real) expect(languageColor(r.language)).not.toBe(OTHER_LANGUAGE);
  });
});

describe("skylineBars", () => {
  const bars = skylineBars(real);
  const shape = skylineShape(real.length);

  it("places one bar per public repo in a 10 by 2 grid", () => {
    expect(real).toHaveLength(20);
    expect(bars).toHaveLength(20);
    expect(shape).toEqual({ cols: 10, rows: 2, w: 10 * SKYLINE.pitch, d: 2 * SKYLINE.pitch });
    const cells = new Set(bars.map((b) => `${b.col}:${b.row}`));
    expect(cells.size).toBe(20);
    for (const b of bars) {
      expect(Math.abs(b.x)).toBeLessThanOrEqual(shape.w / 2 - SKYLINE.pitch / 2 + 1e-9);
      expect(b.z).toBeLessThan(0);
      expect(b.z).toBeGreaterThan(-shape.d);
    }
  });

  it("ranks by stars, puts the most starred in the back row, and keeps heights in star order", () => {
    const byRank = [...bars].sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < byRank.length; i++) {
      expect(byRank[i].stars).toBeLessThanOrEqual(byRank[i - 1].stars);
      expect(byRank[i].h).toBeLessThanOrEqual(byRank[i - 1].h);
    }
    for (const b of bars) expect(b.row).toBe(b.rank < 10 ? 1 : 0);
    expect(byRank[0].stars).toBe(Math.max(...real.map((r) => r.stars)));
    expect(byRank[0].h).toBeCloseTo(SKYLINE.maxH);
  });

  it("colors every bar by its language", () => {
    for (const b of bars) expect(b.color).toBe(languageColor(b.language));
    expect(skylineLanguages(bars).map((l) => l.language)).toEqual([...new Set([...bars].sort((a, b) => a.rank - b.rank).map((b) => b.language))]);
  });

  it("labels the three most starred, far enough apart that their labels never overlap", () => {
    const top = topBars(bars);
    expect(top.map((b) => b.rank)).toEqual([0, 1, 2]);
    for (const a of top) for (const b of top) if (a !== b) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(3 * SKYLINE.pitch - 1e-9);
    // Repos without stars never get a label.
    expect(topBars(bars.map((b) => ({ ...b, stars: 0 })))).toEqual([]);
  });

  it("spreads columns as a permutation, middle first", () => {
    for (const cols of [1, 2, 5, 10]) expect([...spreadColumns(cols)].sort((a, b) => a - b)).toEqual([...Array(cols).keys()]);
    expect(spreadColumns(10)[0]).toBe(5);
  });

  it("handles a small or empty list", () => {
    expect(skylineBars([])).toEqual([]);
    const one = skylineBars([{ slug: "a", name: "a", language: "Python", stars: 0 }]);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ x: 0, row: 0, h: SKYLINE.minH });
  });
});
