import { describe, expect, it } from "vitest";
import { OFFICE_FIXTURE_NOW, OFFICE_FIXTURES } from "@/lib/office/fixtures";
import { OFFICE_DESKS, parseOfficeBeat, parseOfficeResponse, wibDay } from "@/lib/office/protocol";

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
});
