import { describe, expect, it } from "vitest";
import { signalFromBody } from "@/experience/floors/lobby/office/officeSignal";
import { OFFICE_FIXTURES } from "@/lib/office/fixtures";
import type { OfficeSnapshotV1 } from "@/lib/office/protocol";

const busy = OFFICE_FIXTURES.busy as OfficeSnapshotV1;

describe("signalFromBody", () => {
  it("lists asking desks and a recent deploy", () => {
    // The busy fixture's desk 3 already asks; desk 1 asks too.
    const snap = { ...busy, desks: busy.desks.map((d, i) => (i === 1 ? { ...d, state: "input" } : d)), github: [{ kind: "deploy", status: "success", repo: "ShinyQ/ShinyQ-HQ", title: "Deploy · production", at: 1_000, url: "https://github.com/ShinyQ/ShinyQ-HQ" }] };
    expect(signalFromBody(snap, 20_000)).toEqual({ asking: [snap.desks[1].slot, snap.desks[3].slot], deployAt: 1_000 });
    expect(signalFromBody(snap, 40_000)?.deployAt).toBeNull();
  });
  it("returns null for anything malformed, never throws", () => {
    for (const bad of [null, 1, "x", [], { v: 1 }, { v: 1, enabled: true, desks: "x" }, { v: 1, enabled: true, desks: [{ state: 1, slot: "a" }], github: [] }]) expect(signalFromBody(bad, 0)).toBeNull();
    expect(signalFromBody({ v: 1, enabled: false }, 0)).toEqual({ asking: [], deployAt: null });
  });
  it("rejects out-of-range slots, too many desks and hostile shapes", () => {
    const ok = { v: 1, enabled: true, mode: "live", desks: [{ slot: 2, state: "input" }], github: [] };
    expect(signalFromBody(ok, 0)).toEqual({ asking: [2], deployAt: null });
    for (const slot of [-1, 5, 1.5, "2", null]) expect(signalFromBody({ ...ok, desks: [{ slot, state: "input" }] }, 0)).toBeNull();
    expect(signalFromBody({ ...ok, desks: Array.from({ length: 6 }, (_, i) => ({ slot: i % 5, state: "input" })) }, 0)).toBeNull();
    expect(signalFromBody({ ...ok, desks: [null] }, 0)).toBeNull();
    expect(signalFromBody({ ...ok, github: {} }, 0)).toBeNull();
    expect(signalFromBody({ ...ok, v: 2 }, 0)).toBeNull();
    expect(signalFromBody({ ...ok, enabled: "true" }, 0)).toBeNull();
    const hostile = Object.defineProperty({ v: 1, enabled: true, github: [] }, "desks", { get: () => [{ slot: 0, state: "input" }] });
    expect(signalFromBody(hostile, 0)).toEqual({ asking: [0], deployAt: null });
    // GitHub items it cannot read are skipped (they only feed the deploy time), failures and old deploys too.
    const github = [null, 1, { kind: "deploy", status: "failure", at: 0 }, { kind: "deploy", status: "success", at: "0" }, { kind: "run", status: "success", at: 0 }, { kind: "deploy", status: "success", at: 9_000 }, { kind: "deploy", status: "success", at: 5_000 }];
    expect(signalFromBody({ ...ok, github }, 10_000)).toEqual({ asking: [2], deployAt: 9_000 });
  });
  it("asks nothing while the office is off (its Rovers sleep), but keeps semi-live asks like the scene", () => {
    const body = { v: 1, enabled: true, desks: [{ slot: 1, state: "input" }], github: [] };
    expect(signalFromBody({ ...body, mode: "off" }, 0)).toEqual({ asking: [], deployAt: null });
    expect(signalFromBody({ ...body, mode: "semi-live" }, 0)).toEqual({ asking: [1], deployAt: null });
  });
});
