import { describe, expect, it } from "vitest";
import { LOBBY } from "@/experience/config";
import { OFFICE } from "@/experience/floors/lobby/officeLayout";
import { officeChunkState, officeHandle, officeLoadWanted, officeModule } from "@/experience/floors/lobby/office/chunk";

const base = { idle: true, state: "idle", prefetch: true, floor: "L1", rideTo: null, at: LOBBY.spawn } as const;

describe("Agent Office chunk trigger", () => {
  it("loads after the first frame went idle, on L1 (or riding there) near the office, with prefetch on, once", () => {
    expect(Math.hypot(LOBBY.spawn.x - OFFICE.stop.x, LOBBY.spawn.z - OFFICE.stop.z)).toBeLessThan(OFFICE.loadRadius);
    expect(officeLoadWanted(base)).toBe(true);
    expect(officeLoadWanted({ ...base, idle: false })).toBe(false);
    expect(officeLoadWanted({ ...base, prefetch: false })).toBe(false);
    for (const state of ["loading", "ready", "failed"] as const) expect(officeLoadWanted({ ...base, state })).toBe(false);
    expect(officeLoadWanted({ ...base, floor: "L3" })).toBe(false);
    expect(officeLoadWanted({ ...base, floor: "L3", rideTo: "L1", at: LOBBY.arrival })).toBe(true);
    expect(officeLoadWanted({ ...base, rideTo: "L4" })).toBe(false);
    expect(officeLoadWanted({ ...base, at: { x: OFFICE.stop.x + OFFICE.loadRadius + 1, z: OFFICE.stop.z } })).toBe(false);
  });

  it("starts idle with no module and no test hooks", () => {
    expect(officeChunkState()).toBe("idle");
    expect(officeModule()).toBeNull();
    expect(officeHandle.state()).toBe("idle");
    expect(officeHandle.test()).toBeNull();
  });
});
