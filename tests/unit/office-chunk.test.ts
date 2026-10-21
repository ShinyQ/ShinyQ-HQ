import { describe, expect, it, vi } from "vitest";
import { LOBBY } from "@/experience/config";
import { countOfficeAsk, loadOfficeBody, officeChunkState, officeHandle, officeLoadWanted, officeModule } from "@/experience/floors/lobby/office/chunk";
import { OFFICE } from "@/experience/floors/lobby/officeLayout";

// The drawer body chunk, stubbed: the real one renders React with next-intl (tests/hud/OfficeBody.test.tsx).
vi.mock("@/experience/floors/lobby/office/body", () => ({ OfficeBody: () => null }));

const base = { idle: true, state: "idle", prefetch: true, floor: "L1", rideTo: null } as const;

describe("Agent Office chunk trigger (always-live office, design 5.9)", () => {
  it("loads at the spawn once the first frame went idle on L1, with prefetch on, at any distance from the wing", () => {
    // Nothing about where the rover stands: the spawn, the elevator arrival and the wing all load it alike.
    expect(Math.hypot(LOBBY.spawn.x - LOBBY.officeWing.stop.x, LOBBY.spawn.z - LOBBY.officeWing.stop.z)).toBeGreaterThan(30);
    expect(officeLoadWanted(base)).toBe(true);
    expect(officeLoadWanted({ ...base, idle: false })).toBe(false);
    for (const state of ["loading", "ready", "failed"] as const) expect(officeLoadWanted({ ...base, state })).toBe(false);
    expect("loadRadius" in OFFICE).toBe(false);
  });

  it("never asks with ?prefetch=off (only an office drawer loads it then)", () => {
    expect(officeLoadWanted({ ...base, prefetch: false })).toBe(false);
    expect(officeLoadWanted({ ...base, floor: "L3", rideTo: "L1", prefetch: false })).toBe(false);
  });

  it("only on L1 or riding there", () => {
    expect(officeLoadWanted({ ...base, floor: "L3" })).toBe(false);
    expect(officeLoadWanted({ ...base, rideTo: "L4" })).toBe(false);
    expect(officeLoadWanted({ ...base, floor: "L3", rideTo: "L1" })).toBe(true);
    expect(officeLoadWanted({ ...base, floor: "B1" })).toBe(false);
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
