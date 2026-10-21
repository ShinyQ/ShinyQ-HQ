import { describe, expect, it } from "vitest";
import { OFFICE_FIXTURE_NOW, OFFICE_FIXTURES, OFFICE_FIXTURES_V2, OFFICE_FIXTURES_V3, OFFICE_FIXTURES_V4 } from "@/lib/office/fixtures";
import { OFFICE_DESKS, OFFICE_HELPERS_MAX, OFFICE_PIPELINE, OFFICE_SEATS, parseOfficeBeat, parseOfficeResponse, parseOfficeResponseV2, parseOfficeResponseV3, wibDay, type OfficeSnapshotV4 } from "@/lib/office/protocol";
import { parseOfficeResponseV4 } from "@/lib/office/protocolV4";

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

describe("parseOfficeResponseV2 after snapshot v3 (part A clients)", () => {
  it("accepts everything it accepted before: every v1 and v2 fixture, five desks with slots 0 to 4", () => {
    for (const value of [...Object.values(OFFICE_FIXTURES), ...Object.values(OFFICE_FIXTURES_V2)]) expect(parseOfficeResponseV2(JSON.parse(JSON.stringify(value)))).not.toBeNull();
    const busy = JSON.parse(JSON.stringify(OFFICE_FIXTURES_V2.busy));
    expect(parseOfficeResponseV2({ ...busy, desks: busy.desks.map((d: object, slot: number) => ({ ...d, slot: 4 - slot })) })).not.toBeNull();
  });

  it("still rejects a v3 body, a slot above 4 and more than five desks (v1 and v2 never carry them)", () => {
    expect(parseOfficeResponseV2(JSON.parse(JSON.stringify(OFFICE_FIXTURES_V3.busy)))).toBeNull();
    const busy = JSON.parse(JSON.stringify(OFFICE_FIXTURES_V2.busy));
    expect(parseOfficeResponseV2({ ...busy, desks: [{ ...busy.desks[0], slot: 5 }] })).toBeNull();
    expect(parseOfficeResponseV2({ ...busy, desks: Array.from({ length: 6 }, (_, slot) => ({ ...busy.desks[0], slot })) })).toBeNull();
    const busy1 = JSON.parse(JSON.stringify(OFFICE_FIXTURES.busy));
    expect(parseOfficeResponse({ ...busy1, desks: [{ ...busy1.desks[0], slot: 5 }] })).toBeNull();
  });
});

describe("parseOfficeResponseV3", () => {
  const busy3 = () => JSON.parse(JSON.stringify(OFFICE_FIXTURES_V3.busy));

  it("accepts every v3 fixture unchanged: busy seats ten with drones and askers on both rows", () => {
    const busy = OFFICE_FIXTURES_V3.busy;
    expect(busy.enabled && busy.desks.map((d) => d.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(busy.enabled && busy.desks.map((d) => d.helpers ?? 0)).toEqual([3, 0, 6, 0, 0, 2, 0, 0, 0, 4]);
    expect(busy.enabled && busy.desks.filter((d) => d.state === "input").map((d) => d.slot)).toEqual([3, 7]);
    for (const [name, value] of Object.entries(OFFICE_FIXTURES_V3)) expect(parseOfficeResponseV3(JSON.parse(JSON.stringify(value))), name).toEqual(value);
  });

  it("takes up to ten desks with slots 0 to 9 and rejects eleven desks, a slot of 10, duplicates and bad helpers", () => {
    const busy = busy3();
    expect(OFFICE_SEATS).toBe(10);
    expect(parseOfficeResponseV3({ ...busy, desks: [{ ...busy.desks[0], slot: 9 }] })).not.toBeNull();
    expect(parseOfficeResponseV3({ ...busy, desks: [{ ...busy.desks[0], slot: 10 }] })).toBeNull();
    expect(parseOfficeResponseV3({ ...busy, desks: [{ ...busy.desks[0], slot: -1 }] })).toBeNull();
    expect(parseOfficeResponseV3({ ...busy, desks: [...busy.desks, { ...busy.desks[0], slot: 10 }] })).toBeNull();
    expect(parseOfficeResponseV3({ ...busy, desks: Array.from({ length: 11 }, (_, slot) => ({ ...busy.desks[0], slot: slot % 10 })) })).toBeNull();
    expect(parseOfficeResponseV3({ ...busy, desks: [busy.desks[7], { ...busy.desks[8], slot: 7 }] })).toBeNull();
    for (const helpers of [0, 10, 1.5]) expect(parseOfficeResponseV3({ ...busy, desks: [{ ...busy.desks[9], helpers }] }), String(helpers)).toBeNull();
  });

  it("keeps the strict checks: unknown keys, v4, a v3 disabled body", () => {
    const busy = busy3();
    expect(parseOfficeResponseV3({ ...busy, extraField: 1 })).toBeNull();
    expect(parseOfficeResponseV3({ ...busy, desks: [{ ...busy.desks[5], prompt: "hello" }] })).toBeNull();
    expect(parseOfficeResponseV3({ ...busy, pipeline: [] })).toBeNull();
    expect(parseOfficeResponseV3({ ...busy, v: 4 })).toBeNull();
    expect(parseOfficeResponseV3({ v: 3, enabled: false })).toBeNull();
    expect(parseOfficeResponseV3({ v: 1, enabled: false })).toEqual({ v: 1, enabled: false });
    expect(parseOfficeResponseV3(null)).toBeNull();
  });

  it("accepts a v2 or v1 body as a fallback after a rollback, returned as v3", () => {
    for (const [name, value] of Object.entries(OFFICE_FIXTURES_V2)) expect(parseOfficeResponseV3(JSON.parse(JSON.stringify(value))), name).toEqual(value.enabled ? { ...value, v: 3 } : value);
    for (const [name, value] of Object.entries(OFFICE_FIXTURES)) expect(parseOfficeResponseV3(JSON.parse(JSON.stringify(value))), name).toEqual(value.enabled ? { ...value, v: 3 } : value);
    // Still no helpers in a v1 body, and no v4.
    const busy2 = JSON.parse(JSON.stringify(OFFICE_FIXTURES_V2.busy));
    const busy1 = JSON.parse(JSON.stringify(OFFICE_FIXTURES.busy));
    expect(parseOfficeResponseV3({ ...busy1, desks: [{ ...busy1.desks[0], helpers: 3 }] })).toBeNull();
    expect(parseOfficeResponseV3({ ...busy2, v: 4 })).toBeNull();
  });

  it("reads a v2 or v1 body with up to ten desks and slots 0 to 9 (a rolled-back Worker on a ten-seat document); v1 and v2 parsers stay at five", () => {
    const busy2 = JSON.parse(JSON.stringify(OFFICE_FIXTURES_V2.busy));
    const busy1 = JSON.parse(JSON.stringify(OFFICE_FIXTURES.busy));
    const ten = (body: { desks: object[] }) => Array.from({ length: OFFICE_SEATS }, (_, slot) => ({ ...body.desks[0], slot }));
    const v2Ten = { ...busy2, desks: ten(busy2) };
    const v1Ten = { ...busy1, desks: ten(busy1) };
    expect(parseOfficeResponseV3(v2Ten)).toEqual({ ...v2Ten, v: 3 });
    expect(parseOfficeResponseV3(v1Ten)).toEqual({ ...v1Ten, v: 3 });
    expect(parseOfficeResponseV3({ ...busy2, desks: [{ ...busy2.desks[0], slot: 7 }] })).not.toBeNull();
    expect(parseOfficeResponseV2(v2Ten)).toBeNull();
    expect(parseOfficeResponseV2(v1Ten)).toBeNull();
    expect(parseOfficeResponse(v1Ten)).toBeNull();
    for (const body of [busy2, busy1]) {
      expect(parseOfficeResponseV3({ ...body, desks: [...ten(body), { ...body.desks[0], slot: 9 }] })).toBeNull();
      expect(parseOfficeResponseV3({ ...body, desks: [{ ...body.desks[0], slot: 10 }] })).toBeNull();
      expect(parseOfficeResponseV3({ ...body, desks: [body.desks[0], { ...body.desks[1], slot: body.desks[0].slot }] })).toBeNull();
    }
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

describe("snapshot v4", () => {
  const busy = OFFICE_FIXTURES_V4.busy as OfficeSnapshotV4;
  const run = busy.pipeline.runs[0];
  const withPipeline = (pipeline: unknown) => ({ ...busy, pipeline });

  it("accepts the fixtures and rejects extra keys, long lists, bad jobs, a slot past 9 and unknown statuses", () => {
    for (const f of Object.values(OFFICE_FIXTURES_V4)) expect(parseOfficeResponseV4(f)).toEqual(f);
    const bad = [
      withPipeline({ runs: [], ships: [], x: 1 }),
      withPipeline({ runs: Array(OFFICE_PIPELINE.runs + 1).fill(run), ships: [] }),
      withPipeline({ runs: [{ ...run, jobs: Array(OFFICE_PIPELINE.jobs + 1).fill(run.jobs[0]) }], ships: [] }),
      withPipeline({ runs: [{ ...run, jobs: [{ name: "<b>", status: "done" }] }], ships: [] }),
      withPipeline({ runs: [{ ...run, jobs: [{ name: "x".repeat(OFFICE_PIPELINE.jobName + 1), status: "done" }] }], ships: [] }),
      withPipeline({ runs: [{ ...run, slot: OFFICE_SEATS }], ships: [] }),
      withPipeline({ runs: [{ ...run, status: "cancelled" }], ships: [] }),
      withPipeline({ runs: [{ ...run, url: "javascript:alert(1)" }], ships: [] }),
      withPipeline({ runs: [], ships: [{ key: "k", kind: "merge", status: "pushed", at: 1 }] }),
      withPipeline({ runs: [], ships: [{ key: "k".repeat(OFFICE_PIPELINE.key + 1), kind: "deploy", status: "success", at: 1 }] }),
      { ...busy, pipeline: undefined },
      { ...busy, enabled: false },
    ];
    for (const b of bad) expect(parseOfficeResponseV4(b)).toBeNull();
  });

  it("reads a v3, v2 or v1 body (a rolled-back Worker or Function) as v4 with an empty pipeline; the disabled body as is", () => {
    for (const f of [OFFICE_FIXTURES_V3.busy, OFFICE_FIXTURES_V2.busy, OFFICE_FIXTURES.busy]) expect(parseOfficeResponseV4(f)).toEqual({ ...f, v: 4, pipeline: { runs: [], ships: [] } });
    expect(parseOfficeResponseV4(OFFICE_FIXTURES.disabled)).toEqual({ v: 1, enabled: false });
  });

  it("keeps v1, v2 and v3 strict: their parsers reject a v4 body", () => {
    expect(parseOfficeResponse(busy)).toBeNull();
    expect(parseOfficeResponseV2(busy)).toBeNull();
    expect(parseOfficeResponseV3(busy)).toBeNull();
  });

  it("links runs to seats on both rows (the busy fixture's newest run is on back-row desk 6, slot 5)", () => {
    expect(busy.pipeline.runs.map((r) => r.slot)).toEqual([5, 2, undefined]);
  });
});
