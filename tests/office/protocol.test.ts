import { describe, expect, it } from "vitest";
import { OFFICE_FIXTURE_NOW, OFFICE_FIXTURES, OFFICE_FIXTURES_V2 } from "@/lib/office/fixtures";
import { OFFICE_DESKS, OFFICE_HELPERS_MAX, parseOfficeBeat, parseOfficeResponse, parseOfficeResponseV2, wibDay } from "@/lib/office/protocol";

const SESSION = "a".repeat(64);
const beat = (extra: Record<string, unknown> = {}) => ({ v: 1, agent: "copilot", session: SESSION, state: "working", activity: "editing", ts: OFFICE_FIXTURE_NOW, ...extra });

describe("wibDay", () => {
  it("rolls over at 00:00 WIB (17:00 UTC)", () => {
    expect(wibDay(Date.UTC(2026, 9, 18, 16, 59))).toBe("2026-10-18");
    expect(wibDay(Date.UTC(2026, 9, 18, 17, 0))).toBe("2026-10-19");
  });
});

describe("parseOfficeResponse", () => {
  it("accepts every fixture unchanged", () => {
    for (const [name, value] of Object.entries(OFFICE_FIXTURES)) expect(parseOfficeResponse(JSON.parse(JSON.stringify(value))), name).toEqual(value);
  });

  it("rejects unknown keys, bad enums, duplicate slots and too many desks", () => {
    const busy = JSON.parse(JSON.stringify(OFFICE_FIXTURES.busy));
    expect(parseOfficeResponse({ ...busy, extraField: 1 })).toBeNull();
    expect(parseOfficeResponse({ ...busy, mode: "maybe" })).toBeNull();
    expect(parseOfficeResponse({ ...busy, desks: [{ ...busy.desks[0], state: "dancing" }] })).toBeNull();
    expect(parseOfficeResponse({ ...busy, desks: [busy.desks[0], { ...busy.desks[1], slot: busy.desks[0].slot }] })).toBeNull();
    expect(parseOfficeResponse({ ...busy, desks: Array.from({ length: OFFICE_DESKS + 1 }, (_, slot) => ({ ...busy.desks[0], slot })) })).toBeNull();
    expect(parseOfficeResponse({ ...busy, desks: [{ ...busy.desks[0], prompt: "hello" }] })).toBeNull();
    expect(parseOfficeResponse({ ...busy, github: [{ ...busy.github[0], url: "javascript:alert(1)" }] })).toBeNull();
    expect(parseOfficeResponse({ ...busy, github: [{ ...busy.github[0], title: "<script>" }] })).toBeNull();
    expect(parseOfficeResponse({ v: 1, enabled: false, mode: "live" })).toBeNull();
    expect(parseOfficeResponse({ v: 2, enabled: false })).toBeNull();
    expect(parseOfficeResponse(null)).toBeNull();
  });
});

describe("parseOfficeResponse (v1) never takes helpers", () => {
  it("rejects a v1 body carrying helpers on a desk, and any v2 body", () => {
    const busy = JSON.parse(JSON.stringify(OFFICE_FIXTURES.busy));
    expect(parseOfficeResponse({ ...busy, desks: [{ ...busy.desks[0], helpers: 3 }] })).toBeNull();
    expect(parseOfficeResponse({ ...busy, helpers: 3 })).toBeNull();
    expect(parseOfficeResponse(JSON.parse(JSON.stringify(OFFICE_FIXTURES_V2.busy)))).toBeNull();
  });
});

describe("parseOfficeResponseV2", () => {
  const busy2 = () => JSON.parse(JSON.stringify(OFFICE_FIXTURES_V2.busy));

  it("accepts every v2 fixture unchanged", () => {
    expect(OFFICE_FIXTURES_V2.busy.enabled && OFFICE_FIXTURES_V2.busy.desks.map((d) => d.helpers)).toEqual([3, undefined, 6, undefined, undefined]);
    for (const [name, value] of Object.entries(OFFICE_FIXTURES_V2)) expect(parseOfficeResponseV2(JSON.parse(JSON.stringify(value))), name).toEqual(value);
  });

  it("accepts desk helpers 1 and 9 and rejects 0, 10, a fraction and a string", () => {
    const busy = busy2();
    for (const helpers of [1, OFFICE_HELPERS_MAX]) expect(parseOfficeResponseV2({ ...busy, desks: [{ ...busy.desks[0], helpers }] }), String(helpers)).not.toBeNull();
    for (const helpers of [0, 10, 1.5, "3", null]) expect(parseOfficeResponseV2({ ...busy, desks: [{ ...busy.desks[0], helpers }] }), String(helpers)).toBeNull();
  });

  it("keeps the v1 checks: strict keys, enums, slots", () => {
    const busy = busy2();
    expect(parseOfficeResponseV2({ ...busy, extraField: 1 })).toBeNull();
    expect(parseOfficeResponseV2({ ...busy, desks: [{ ...busy.desks[0], prompt: "hello" }] })).toBeNull();
    expect(parseOfficeResponseV2({ ...busy, desks: [busy.desks[0], { ...busy.desks[1], slot: busy.desks[0].slot }] })).toBeNull();
    expect(parseOfficeResponseV2({ ...busy, v: 3 })).toBeNull();
    expect(parseOfficeResponseV2({ v: 2, enabled: false })).toBeNull();
    expect(parseOfficeResponseV2(null)).toBeNull();
  });

  it("accepts a v1 body as a fallback after a rollback, as a v2 snapshot without helpers", () => {
    for (const [name, value] of Object.entries(OFFICE_FIXTURES)) {
      const parsed = parseOfficeResponseV2(JSON.parse(JSON.stringify(value)));
      expect(parsed, name).toEqual(value.enabled ? { ...value, v: 2 } : value);
    }
    const busy = JSON.parse(JSON.stringify(OFFICE_FIXTURES.busy));
    expect(parseOfficeResponseV2({ ...busy, desks: [{ ...busy.desks[0], helpers: 3 }] })).toBeNull();
  });
});

describe("parseOfficeBeat", () => {
  it("accepts a minimal beat and one with an allowlisted repository", () => {
    expect(parseOfficeBeat(beat())).toEqual(beat());
    const full = beat({ repo: "ShinyQ/ShinyQ-HQ", branch: "feat/intro-orbit-reveal", title: "Intro orbit reveal" });
    expect(parseOfficeBeat(full)).toEqual(full);
  });

  it("rejects extra fields, bad enums, a raw session id and titles with markup", () => {
    expect(parseOfficeBeat(beat({ prompt: "fix the bug" }))).toBeNull();
    expect(parseOfficeBeat(beat({ cwd: "/Users/x" }))).toBeNull();
    expect(parseOfficeBeat(beat({ agent: "cursor" }))).toBeNull();
    expect(parseOfficeBeat(beat({ state: "idle" }))).toBeNull();
    expect(parseOfficeBeat(beat({ session: "session-123" }))).toBeNull();
    expect(parseOfficeBeat(beat({ repo: "ShinyQ/ShinyQ-HQ", title: "<b>x</b>" }))).toBeNull();
    expect(parseOfficeBeat(beat({ repo: "ShinyQ/ShinyQ-HQ", title: "x".repeat(81) }))).toBeNull();
    expect(parseOfficeBeat(beat({ title: "Orphan title" }))).toBeNull();
    expect(parseOfficeBeat(beat({ ts: 1.5 }))).toBeNull();
  });

  it("accepts a helper count from 0 to 9 and nothing else", () => {
    expect(OFFICE_HELPERS_MAX).toBe(9);
    for (const helpers of [0, 1, 9]) expect(parseOfficeBeat(beat({ helpers }))).toEqual(beat({ helpers }));
    for (const helpers of [-1, 10, 1.5, "2", null, true]) expect(parseOfficeBeat(beat({ helpers })), String(helpers)).toBeNull();
  });
});
