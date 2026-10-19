import { describe, expect, it, vi } from "vitest";
import { LOBBY } from "@/experience/config";
import { OFFICE } from "@/experience/floors/lobby/officeLayout";
import { countOfficeAsk, loadOfficeBody, officeChunkState, officeHandle, officeLoadWanted, officeModule } from "@/experience/floors/lobby/office/chunk";

// The drawer body chunk, stubbed: the real one renders React with next-intl (tests/hud/OfficeBody.test.tsx).
vi.mock("@/experience/floors/lobby/office/body", () => ({ OfficeBody: () => null }));

const base = { idle: true, state: "idle", prefetch: true, floor: "L1", rideTo: null, at: LOBBY.spawn } as const;

describe("Agent Office chunk trigger", () => {
  it("loads after the first frame went idle, on L1 (or riding there) near the office, with prefetch on, once", () => {
    const { stop } = LOBBY.officeWing;
    // The trigger measures to the wing's stop: the spawn and the elevator arrival point are both within the radius.
    expect(Math.hypot(LOBBY.spawn.x - stop.x, LOBBY.spawn.z - stop.z)).toBeLessThan(OFFICE.loadRadius);
    expect(Math.hypot(LOBBY.arrival.x - stop.x, LOBBY.arrival.z - stop.z)).toBeLessThan(OFFICE.loadRadius);
    expect(officeLoadWanted(base)).toBe(true);
    expect(officeLoadWanted({ ...base, idle: false })).toBe(false);
    expect(officeLoadWanted({ ...base, prefetch: false })).toBe(false);
    for (const state of ["loading", "ready", "failed"] as const) expect(officeLoadWanted({ ...base, state })).toBe(false);
    expect(officeLoadWanted({ ...base, floor: "L3" })).toBe(false);
    expect(officeLoadWanted({ ...base, floor: "L3", rideTo: "L1", at: LOBBY.arrival })).toBe(true);
    expect(officeLoadWanted({ ...base, rideTo: "L4" })).toBe(false);
    expect(officeLoadWanted({ ...base, at: { x: stop.x + OFFICE.loadRadius + 1, z: stop.z } })).toBe(false);
    expect(officeLoadWanted({ ...base, at: { x: stop.x, z: stop.z + OFFICE.loadRadius - 1 } })).toBe(true);
  });

  it("starts idle with no module and no test hooks", () => {
    expect(officeChunkState()).toBe("idle");
    expect(officeModule()).toBeNull();
    expect(officeHandle.state()).toBe("idle");
    expect(officeHandle.test()).toBeNull();
  });

  it("counts the trigger's asks after the first frame went idle for the test handle", () => {
    expect(officeHandle.asks()).toBe(0);
    countOfficeAsk();
    countOfficeAsk();
    expect(officeHandle.asks()).toBe(2);
  });

  it("loads the drawer body as its own chunk, once, without loading the scene chunk", async () => {
    const first = loadOfficeBody();
    expect(loadOfficeBody()).toBe(first);
    expect(typeof (await first).OfficeBody).toBe("function");
    await officeHandle.loadBody();
    expect(officeChunkState()).toBe("idle");
    expect(officeModule()).toBeNull();
  });
});
