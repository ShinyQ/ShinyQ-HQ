import { describe, expect, it, vi } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { buildFloorLayouts } from "@/experience/config";
import { isAutoOpenClaimed, claimAutoOpen, register3DHost, resolveHost, visitedRooms, type HostDeps } from "@/experience/missions/bridge";
import type { MissionHost } from "@/experience/missions/host";
import { LIBRARY_STOPS, postStop } from "@/experience/floors/library/layout";
import { ROOF_STOPS } from "@/experience/floors/roof/layout";
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
  room({ id: "L3:listed", floor: "L3", kind: "pod", wing: "software", tier: "listed", path: "/labs/listed" }),
  room({ id: "L4:newest", floor: "L4", kind: "post", path: "/blog/newest" }),
  room({ id: "L4:medium-post", floor: "L4", kind: "post", path: "/library#posts", external: "https://medium.com/x" }),
  room({ id: "L4:oldest", floor: "L4", kind: "post", path: "/blog/oldest" }),
  room({ id: "L4:publications", floor: "L4", kind: "shelf", path: "/library#publications" }),
  room({ id: "L4:talks", floor: "L4", kind: "shelf", path: "/library#talks" }),
  room({ id: "RF:contact", floor: "RF", kind: "roof", path: "/contact" }),
  room({ id: "RF:cv", floor: "RF", kind: "roof", path: "/cv" }),
];
const byId = (id: string) => ROOMS.find((r) => r.id === id);
const layouts = buildFloorLayouts(8, {
  labs: [{ id: "voice-ai", slug: "voice-ai", title: "Voice AI", tier: "hero", wing: "ai", accent: "violet", hologram: "waveform", order: 0, hasHologramView: true }],
});
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
  it("drives to the door zone of an L2 corridor room", () => {
    const career = { years: [{ year: 2024, entries: [{ slug: "jenius-2024", type: "job" as const }] }], benches: 2 };
    const built = buildFloorLayouts(1, { career });
    const door = built.L2.doors!.find((d) => d.room === "L2:jenius-2024")!;
    expect(roomTarget(undefined, "L2:jenius-2024", built, [2024])).toEqual(door.at);
    expect(roomTarget(undefined, "L2:workshop", built, [2024])).toEqual(built.L2.doors!.at(-1)!.at);
    expect(built.L2.scrubStops).toHaveLength(2);
  });

  it("stops in front of Lobby elements", () => {
    const p = roomTarget(ROOMS[0], "L1:skills", layouts, years);
    expect(p.x).toBe(0);
    expect(p.z).toBeGreaterThan(-15);
  });

  it("uses the year segment on L2, pod doors on L3 and the wing directory for listed items", () => {
    expect(roomTarget(ROOMS[1], "L2:jenius-2024", layouts, years)).toEqual({ x: -20 + 14 * 5 + 7, z: 0 });
    expect(roomTarget(ROOMS[2], "L3:voice-ai", layouts, years)).toEqual(layouts.L3.doors![0].at);
    const listed = roomTarget(ROOMS[3], "L3:listed", layouts, years);
    expect(listed.z).toBeLessThan(0);
    expect(listed.x).toBeLessThan(-10);
  });

  it("falls back near the floor label", () => {
    const p = roomTarget(undefined, "L4:unknown", layouts, years);
    expect(p).toEqual({ x: layouts.L4.approach.x + 7, z: layouts.L4.approach.z - 3 });
  });

  it("drives to the post's spine using the catalog's post order", () => {
    expect(roomTarget(byId("L4:newest"), "L4:newest", layouts, years, ROOMS)).toEqual(postStop(0, 3));
    expect(roomTarget(byId("L4:oldest"), "L4:oldest", layouts, years, ROOMS)).toEqual(postStop(2, 3));
    expect(roomTarget(byId("L4:medium-post"), "L4:medium-post", layouts, years, ROOMS)).toEqual(postStop(1, 3));
  });

  it("stops at the publications shelf, the talks stage, the comms terminals and the CV kiosk (their doors)", () => {
    expect(roomTarget(byId("L4:publications"), "L4:publications", layouts, years, ROOMS)).toEqual(LIBRARY_STOPS.publications);
    expect(roomTarget(byId("L4:talks"), "L4:talks", layouts, years, ROOMS)).toEqual(LIBRARY_STOPS.talks);
    expect(roomTarget(byId("RF:contact"), "RF:contact", layouts, years)).toEqual(ROOF_STOPS.contact);
    expect(roomTarget(undefined, "RF:cv", layouts, years)).toEqual(ROOF_STOPS.cv);
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

  it("opens rooms on every built floor in the drawer", async () => {
    const { store, deps, host } = setup();
    await host.openRoom("L1:skills", undefined, { signal: signal(), missionId: "m" });
    expect(store.getState()).toMatchObject({ phase: "room", activeRoom: "L1:skills" });
    await host.openRoom("L3:voice-ai", "architecture", { signal: signal(), missionId: "m" });
    expect(store.getState()).toMatchObject({ phase: "room", activeRoom: "L3:voice-ai", drawerTab: "architecture" });
    await host.openRoom("L2:jenius-2024", undefined, { signal: signal(), missionId: "m" });
    expect(store.getState()).toMatchObject({ phase: "room", activeRoom: "L2:jenius-2024" });
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(store.getState().visited).toEqual(["L1:skills", "L3:voice-ai", "L2:jenius-2024"]);
  });

  it("closes the hologram before riding to another floor, and fails a blocked ride instead of hanging", async () => {
    const { store, host } = setup();
    store.getState().openRoom("L1:skills");
    store.getState().openHologram();
    await host.elevator("L3", { signal: signal(), missionId: "m" });
    expect(store.getState()).toMatchObject({ floor: "L3", activeRoom: null });
    store.getState().setPhase("palette");
    await expect(host.elevator("L1", { signal: signal(), missionId: "m" })).rejects.toThrow(/unavailable/);
  });

  it("closes an open room before driving away", async () => {
    const { store, host } = setup();
    store.getState().openRoom("L1:skills");
    await host.driveTo("L1:profile", { signal: signal(), missionId: "m" });
    expect(store.getState()).toMatchObject({ phase: "explore", activeRoom: null });
  });

  it("opens Library and Roof rooms in 3D and leaves them before the next drive", async () => {
    const { store, deps, host, rover } = setup();
    await host.openRoom("L4:newest", undefined, { signal: signal(), missionId: "m" });
    expect(store.getState()).toMatchObject({ activeRoom: "L4:newest", phase: "room" });
    await host.openRoom("RF:cv", undefined, { signal: signal(), missionId: "m" });
    expect(store.getState().activeRoom).toBe("RF:cv");
    expect(deps.navigate).not.toHaveBeenCalled();
    await host.driveTo("RF:contact", { signal: signal(), missionId: "m" });
    expect(store.getState()).toMatchObject({ activeRoom: null, phase: "explore" });
    expect(rover.autopilot?.point).toEqual(ROOF_STOPS.contact);
  });

  it("drives to a post's spine through the host", async () => {
    const { rover, host } = setup();
    await host.driveTo("L4:oldest", { signal: signal(), missionId: "m" });
    expect(rover.autopilot?.point).toEqual(postStop(2, 3));
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
