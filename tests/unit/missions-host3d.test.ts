import { describe, expect, it, vi } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { buildFloorLayouts } from "@/experience/config";
import { isAutoOpenClaimed, claimAutoOpen, register3DHost, resolveHost, visitedRooms, type HostDeps } from "@/experience/missions/bridge";
import type { MissionHost } from "@/experience/missions/host";
import { create3DHost, roomTarget, type RoverChannel } from "@/experience/missions/host3d";
import type { RoomInfo } from "@/experience/missions/rooms";
import { createHQStore } from "@/store/useHQStore";

const memory = (): StateStorage => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

const room = (over: Partial<RoomInfo> & Pick<RoomInfo, "id" | "floor" | "kind">): RoomInfo => ({
  slug: over.id.split(":")[1],
  title: { en: "Room", id: "Ruang" },
  keywords: [],
  path: "/x",
  floorPath: "/x",
  surpriseWeight: 1,
  ...over,
});

const ROOMS: RoomInfo[] = [
  room({ id: "L1:skills", floor: "L1", kind: "lobby", path: "/#skills" }),
  room({ id: "L2:jenius-2024", floor: "L2", kind: "career", year: 2024, path: "/journey/jenius-2024" }),
  room({ id: "L3:voice-ai", floor: "L3", kind: "pod", wing: "ai", path: "/labs/voice-ai" }),
];
const layouts = buildFloorLayouts(8);
const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const signal = () => new AbortController().signal;

function setup() {
  const store = createHQStore(memory());
  store.getState().setPhase("explore");
  const rover: RoverChannel = { autopilot: null, cancelFlash: false };
  const deps: HostDeps = { locale: "en", rooms: ROOMS, navigate: vi.fn(), say: vi.fn(), openPalette: vi.fn() };
  // A fake frame loop that plays the Director's part: finish rides and drives.
  const tick = async () => {
    const s = store.getState();
    if (s.ride) s.arriveFloor(s.ride.to);
    if (rover.autopilot) rover.autopilot.state = "done";
  };
  const host = create3DHost(deps, { store, rover, layouts, years, tick });
  return { store, rover, deps, host };
}

describe("roomTarget", () => {
  it("stops in front of Lobby elements", () => {
    const p = roomTarget(ROOMS[0], "L1:skills", layouts, years);
    expect(p.x).toBe(0);
    expect(p.z).toBeGreaterThan(-15);
  });

  it("uses the year segment on L2 and the wing side on L3", () => {
    expect(roomTarget(ROOMS[1], "L2:jenius-2024", layouts, years)).toEqual({ x: -20 + 14 * 5 + 7, z: 0 });
    expect(roomTarget(ROOMS[2], "L3:voice-ai", layouts, years).x).toBeGreaterThan(0);
  });

  it("falls back near the floor label", () => {
    const p = roomTarget(undefined, "RF:contact", layouts, years);
    expect(p.x).toBeGreaterThan(layouts.RF.approach.x);
  });
});

describe("3D mission host", () => {
  it("rides the elevator and resolves on arrival", async () => {
    const { store, host } = setup();
    await host.elevator("L3", { signal: signal(), missionId: "m" });
    expect(store.getState()).toMatchObject({ floor: "L3", ride: null });
  });

  it("finishes the intro before a mission rides the elevator", async () => {
    const { store, host } = setup();
    store.getState().setPhase("intro");
    await host.elevator("L2", { signal: signal(), missionId: "m" });
    expect(store.getState().floor).toBe("L2");
  });

  it("requests an autopilot drive and resolves when it is done", async () => {
    const { rover, host } = setup();
    await host.driveTo("L1:skills", { signal: signal(), missionId: "m" });
    expect(rover.autopilot?.state).toBe("done");
    expect(rover.autopilot?.point.x).toBe(0);
  });

  it("stops waiting when the mission is aborted", async () => {
    const store = createHQStore(memory());
    store.getState().setPhase("explore");
    const rover: RoverChannel = { autopilot: null, cancelFlash: false };
    const deps: HostDeps = { locale: "en", rooms: ROOMS, navigate: vi.fn(), say: vi.fn(), openPalette: vi.fn() };
    const host = create3DHost(deps, { store, rover, layouts, years, tick: () => new Promise((r) => setTimeout(r, 1)) });
    const controller = new AbortController();
    const drive = host.driveTo({ x: 5, z: 5 }, { signal: controller.signal, missionId: "m" });
    controller.abort();
    await expect(drive).resolves.toBeUndefined();
  });

  it("keeps Lobby rooms in 3D and opens other rooms as pages", async () => {
    const { store, deps, host } = setup();
    await host.openRoom("L1:skills", undefined, { signal: signal(), missionId: "m" });
    expect(deps.navigate).not.toHaveBeenCalled();
    await host.openRoom("L3:voice-ai", "architecture", { signal: signal(), missionId: "m" });
    expect(deps.navigate).toHaveBeenCalledWith("/en/labs/voice-ai#architecture");
    expect(store.getState().visited).toEqual(["L1:skills", "L3:voice-ai"]);
  });

  it("says text in the visitor's locale and opens the palette", async () => {
    const { deps, host } = setup();
    const controller = new AbortController();
    const saying = host.say({ en: "hi", id: "halo" }, 5000, { signal: controller.signal, missionId: "m" });
    controller.abort();
    await saying;
    expect(deps.say).toHaveBeenCalledWith("hi", 5000);
    await host.openPalette("pods", { signal: signal(), missionId: "m" });
    expect(deps.openPalette).toHaveBeenCalledWith("pods");
  });

  it("flashes o_o and clears the autopilot on cancel", () => {
    const { rover, store, host } = setup();
    rover.autopilot = { point: { x: 1, z: 1 }, state: "driving" };
    store.getState().requestElevator("L2");
    host.finish?.("cancelled", "m");
    expect(rover).toEqual({ autopilot: null, cancelFlash: true });
    expect(store.getState().ride).toBeNull();
  });
});

describe("mission bridge", () => {
  it("resolves the 3D host only while registered", () => {
    const fallback = { isStatic: true } as MissionHost;
    const deps = { locale: "en", rooms: [], navigate: vi.fn(), say: vi.fn(), openPalette: vi.fn() } as HostDeps;
    expect(resolveHost(deps, fallback)).toBe(fallback);
    const made = { isStatic: false } as MissionHost;
    const off = register3DHost(() => made, () => ["L1:skills"]);
    expect(resolveHost(deps, fallback)).toBe(made);
    expect(resolveHost(deps, fallback)).toBe(made);
    expect(visitedRooms()).toEqual(["L1:skills"]);
    off();
    expect(resolveHost(deps, fallback)).toBe(fallback);
    expect(visitedRooms()).toBeNull();
  });

  it("tracks the auto-open claim", () => {
    claimAutoOpen(true);
    expect(isAutoOpenClaimed()).toBe(true);
    claimAutoOpen(false);
    expect(isAutoOpenClaimed()).toBe(false);
  });
});
