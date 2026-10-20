import { describe, expect, it, vi } from "vitest";
import content from "../../content/site-content.json";
import { LOBBY } from "@/experience/config";
import { isOfficeRoom, OFFICE } from "@/experience/floors/lobby/officeLayout";
import { countOfficeAsk, loadOfficeBody, OFFICE_MISSION, officeChunkState, officeHandle, officeLoadWanted, officeModule } from "@/experience/floors/lobby/office/chunk";

// The drawer body chunk, stubbed: the real one renders React with next-intl (tests/hud/OfficeBody.test.tsx).
vi.mock("@/experience/floors/lobby/office/body", () => ({ OfficeBody: () => null }));

const { stop, rect, lead } = LOBBY.officeWing;
const base = { idle: true, state: "idle", prefetch: true, floor: "L1", rideTo: null, at: stop, mission: null } as const;
const dist = (p: { x: number; z: number }) => Math.hypot(p.x - stop.x, p.z - stop.z);

describe("Agent Office chunk trigger", () => {
  it("loads after the first frame went idle, on L1 (or riding there) near the office, with prefetch on, once", () => {
    expect(officeLoadWanted(base)).toBe(true);
    expect(officeLoadWanted({ ...base, idle: false })).toBe(false);
    expect(officeLoadWanted({ ...base, prefetch: false })).toBe(false);
    for (const state of ["loading", "ready", "failed"] as const) expect(officeLoadWanted({ ...base, state })).toBe(false);
    expect(officeLoadWanted({ ...base, floor: "L3" })).toBe(false);
    expect(officeLoadWanted({ ...base, rideTo: "L4" })).toBe(false);
    expect(officeLoadWanted({ ...base, at: { x: stop.x + OFFICE.loadRadius + 1, z: stop.z } })).toBe(false);
    expect(officeLoadWanted({ ...base, at: { x: stop.x, z: stop.z - OFFICE.loadRadius + 1 } })).toBe(true);
  });

  it("measures 25 u from the wing's stop: the lead road and the wing load it, the spawn and the elevator arrival do not", () => {
    expect(OFFICE.loadRadius).toBe(25);
    // Spawn 33.2 u and arrival 44.4 u from the stop (the 54 u deep Lobby, more room 2026-10-19): a session that never
    // heads south does not fetch the office.
    expect(dist(LOBBY.spawn)).toBeCloseTo(33.21, 1);
    expect(dist(LOBBY.arrival)).toBeCloseTo(44.42, 1);
    expect(officeLoadWanted({ ...base, at: LOBBY.spawn })).toBe(false);
    expect(officeLoadWanted({ ...base, floor: "L3", rideTo: "L1", at: LOBBY.arrival })).toBe(false);
    // The lead road's Lobby end (24.5 u) and every corner of the wing are inside.
    expect(dist({ x: lead.x, z: lead.from })).toBeLessThan(OFFICE.loadRadius);
    expect(officeLoadWanted({ ...base, at: { x: lead.x, z: lead.from } })).toBe(true);
    for (const x of [rect.minX, rect.maxX]) for (const z of [rect.minZ, rect.maxZ]) expect(officeLoadWanted({ ...base, at: { x, z } }), `${x}, ${z}`).toBe(true);
  });

  it("a mission bound for the office loads it at once, from the ride to L1 on (the office mission, a goto to an office room)", () => {
    const ride = { ...base, floor: "L3", rideTo: "L1", at: LOBBY.arrival } as const;
    expect(officeLoadWanted({ ...ride, mission: OFFICE_MISSION })).toBe(true);
    expect(officeLoadWanted({ ...ride, mission: "goto:L1:office" })).toBe(true);
    expect(officeLoadWanted({ ...ride, mission: "goto:L1:office-desk-3" })).toBe(true);
    expect(officeLoadWanted({ ...base, at: LOBBY.spawn, mission: "goto:L1:office-github" })).toBe(true);
    expect(officeLoadWanted({ ...ride, mission: "goto:L1:skills" })).toBe(false);
    expect(officeLoadWanted({ ...ride, mission: "tour" })).toBe(false);
    // Not before the ride to L1 starts, and never with prefetch off.
    expect(officeLoadWanted({ ...ride, rideTo: null, mission: OFFICE_MISSION })).toBe(false);
    expect(officeLoadWanted({ ...ride, prefetch: false, mission: OFFICE_MISSION })).toBe(false);
    // The catalog mission it names rides to L1 and drives to an office room.
    const mission = content.missions.find((m) => m.id === OFFICE_MISSION);
    expect(mission?.steps.some((s) => s.kind === "elevator" && "floor" in s && s.floor === "L1")).toBe(true);
    expect(mission?.steps.some((s) => s.kind === "drive" && "to" in s && typeof s.to === "string" && isOfficeRoom(s.to))).toBe(true);
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
