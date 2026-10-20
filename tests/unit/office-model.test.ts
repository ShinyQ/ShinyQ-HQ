import { describe, expect, it } from "vitest";
import { COLORS } from "@/experience/config";
import { deskTitle, officeCounts, safeGithubUrl, safeRepoUrl, sinceLabel, STATE_TONE } from "@/lib/office/model";
import { OFFICE_STATES, parseOfficeResponse } from "@/lib/office/protocol";
import { STATES_A, STATES_B, statesA, statesB } from "../../e2e/office-fixtures";

const NOW = 1_800_000_000_000;

describe("shared office model (src/lib/office/model.ts)", () => {
  it("ships fixtures that pass the real protocol parser and cover all nine states", () => {
    for (const snapshot of [statesA(NOW), statesA(NOW, 0), statesB(NOW)]) expect(parseOfficeResponse(snapshot)).toEqual(snapshot);
    expect(statesA(NOW).desks.map((d) => d.state)).toEqual(STATES_A);
    expect(statesB(NOW).desks.map((d) => d.state)).toEqual(STATES_B.slice(0, 4));
    expect(new Set([...STATES_A, ...STATES_B])).toEqual(new Set(OFFICE_STATES));
  });

  it("counts active (working, reviewing, testing, done, failed), thinking, waiting (ci, input) and asleep plus empty slots", () => {
    expect(officeCounts(statesA(NOW).desks)).toEqual({ active: 3, thinking: 1, waiting: 1, asleep: 0 });
    expect(officeCounts(statesB(NOW).desks)).toEqual({ active: 2, thinking: 0, waiting: 1, asleep: 2 });
    expect(officeCounts([])).toEqual({ active: 0, thinking: 0, waiting: 0, asleep: 5 });
    expect(officeCounts([], 3).asleep).toBe(3);
  });

  it("returns a desk title only when the snapshot carries one", () => {
    const [working, thinking] = statesA(NOW).desks;
    expect(deskTitle(working)).toBe("Agent office scene");
    expect(deskTitle(thinking)).toBeNull();
    expect(deskTitle({ ...thinking, title: "" })).toBeNull();
  });

  it("has one tone per state, the palette tokens where one matches", () => {
    expect(Object.keys(STATE_TONE).sort()).toEqual([...OFFICE_STATES].sort());
    expect(STATE_TONE.working).toBe(COLORS.cyan);
    expect(STATE_TONE.thinking).toBe(COLORS.amber);
    expect(STATE_TONE.ci).toBe(COLORS.violet);
    expect(STATE_TONE.input).toBe(COLORS.pink);
    expect(STATE_TONE.done).toBe(COLORS.green);
    expect(new Set(Object.values(STATE_TONE)).size).toBe(OFFICE_STATES.length);
  });

  it("writes short since labels in both locales", () => {
    expect(sinceLabel(NOW - 20_000, "en", NOW)).toBe("just now");
    expect(sinceLabel(NOW - 3 * 60_000, "en", NOW)).toBe("3 min");
    expect(sinceLabel(NOW - 2 * 3_600_000, "en", NOW)).toBe("2 h");
    expect(sinceLabel(NOW - 3 * 86_400_000, "en", NOW)).toBe("3 d");
    expect(sinceLabel(NOW - 20_000, "id", NOW)).toBe("baru saja");
    expect(sinceLabel(NOW - 3 * 60_000, "id", NOW)).toBe("3 mnt");
    expect(sinceLabel(NOW - 2 * 3_600_000, "id", NOW)).toBe("2 j");
    expect(sinceLabel(NOW + 5_000, "en", NOW)).toBe("just now");
  });

  it("links only well-formed public GitHub repositories and github.com URLs", () => {
    expect(safeRepoUrl("ShinyQ/ShinyQ-HQ")).toBe("https://github.com/ShinyQ/ShinyQ-HQ");
    expect(safeRepoUrl("ShinyQ/../x")).toBeNull();
    expect(safeRepoUrl("ShinyQ/..")).toBeNull();
    expect(safeRepoUrl("javascript:alert(1)")).toBeNull();
    expect(safeRepoUrl(null)).toBeNull();
    expect(safeGithubUrl("https://github.com/ShinyQ/ShinyQ-HQ/pull/1")).toBe("https://github.com/ShinyQ/ShinyQ-HQ/pull/1");
    expect(safeGithubUrl("http://github.com/x")).toBeNull();
    expect(safeGithubUrl("https://evil.example/github.com")).toBeNull();
    expect(safeGithubUrl("not a url")).toBeNull();
  });
});
