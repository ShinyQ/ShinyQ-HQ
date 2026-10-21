import { describe, expect, it } from "vitest";
import { OFFICE_HISTORY_FIXTURES } from "../../src/lib/office/fixtures";
import { dayStart, historyWindow, OFFICE_HISTORY, parseOfficeHistory, parseOfficeHistoryIndex } from "../../src/lib/office/protocolHistory";

const { index, day } = OFFICE_HISTORY_FIXTURES;
const withDay = (patch: Record<string, unknown>) => ({ ...day, ...patch });
const event = (e: unknown[]) => withDay({ events: [e] });

describe("history contract", () => {
  it("knows the WIB midnight and the 8-day window", () => {
    expect(dayStart("2026-10-20")).toBe(Date.UTC(2026, 9, 19, 17));
    const w = historyWindow(Date.UTC(2026, 9, 19, 17, 0, 1));
    expect(w).toHaveLength(8);
    expect(w[0]).toBe("2026-10-20");
    expect(w[7]).toBe("2026-10-13");
  });
  it("accepts the fixtures and the disabled body", () => {
    expect(parseOfficeHistoryIndex(index)).toEqual(index);
    expect(parseOfficeHistory(day)).toEqual(day);
    expect(parseOfficeHistory({ v: 1, enabled: false })).toEqual({ v: 1, enabled: false });
  });
  it("rejects hostile or out-of-range bodies", () => {
    const bad = [
      withDay({ keys: ["a".repeat(64)] }),
      withDay({ start: day.start + 1 }),
      event([0, 0, 10, 0, 0, 5, 0]),
      event([0, 0, -2, 0, 0, 5, 0]),
      event([0, 0, 0, 9, 0, 5, 0]),
      event([0, 0, 0, 0, 12, 5, 0]),
      event([0, 0, 0, 0, 0, 5, 10]),
      event([86_401, 0, 0, 0, 0, 5, 0]),
      event([0, 0, 0, 0, 0, -1801, 0]),
      event([0, 99, 0, 0, 0, 5, 0]),
      withDay({ events: [[5, 0, 0, 0, 0, 5, 0], [4, 0, 0, 0, 0, 5, 0]] }),
      withDay({ events: Array.from({ length: OFFICE_HISTORY.events + 1 }, () => [0, 0, 0, 0, 0, 0, 0]) }),
      withDay({ tasks: { "0": { repo: "ShinyQ/ShinyQ-HQ", title: "<img src=x>" } } }),
      withDay({ tasks: { "0": { repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x" } } }),
      withDay({ tasks: JSON.parse('{"__proto__":{"repo":"ShinyQ/ShinyQ-HQ"}}') }),
      withDay({ prs: [[5, 0, "", 7, "Thing"]] }),
      withDay({ runs: [[50, 40, 0, 1, 3]] }),
      withDay({ runs: [[0, 40, 0, 1, 25]] }),
      withDay({ deploys: [[5, 2]] }),
    ];
    for (const raw of bad) expect(parseOfficeHistory(raw), JSON.stringify(raw).slice(0, 120)).toBeNull();
    expect(parseOfficeHistoryIndex({ ...index, days: index.days.slice(1) })).toBeNull();
    expect(parseOfficeHistoryIndex({ ...index, days: [...index.days].reverse() })).toBeNull();
    expect(parseOfficeHistoryIndex({ ...index, extra: 1 })).toBeNull();
  });
});
