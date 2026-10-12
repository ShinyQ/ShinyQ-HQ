import { describe, expect, it, vi } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { buildFloorLayouts, LOBBY } from "@/experience/config";
import { isAutoOpenClaimed, claimAutoOpen, register3DHost, registerWalkStarter, resolveHost, visitedRooms, type HostDeps } from "@/experience/missions/bridge";
import type { MissionHost } from "@/experience/missions/host";
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
const post = (slug: string, date: string, external = false) => ({ slug, date, tags: [], external });
const layouts = buildFloorLayouts(8, {
  labs: [{ id: "voice-ai", slug: "voice-ai", title: "Voice AI", tier: "hero", wing: "ai", accent: "violet", hologram: "waveform", order: 0, hasHologramView: true, hasGallery: true }],
  library: { posts: [post("newest", "2026-10-01"), post("medium-post", "2022-02-28", true), post("oldest", "2020-12-31")], research: 1, models: 1, talks: 1 },
});
const l4Door = (id: string) => layouts.L4.doors!.find((d) => d.room === id)!.at;
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
    expect(p.x).toBe(LOBBY.skillsWall.x);
    expect(p.z).toBeGreaterThan(LOBBY.skillsWall.z + 1);
  });

  it("uses the year segment on L2, pod doors on L3 and the wing directory for listed items", () => {
    expect(roomTarget(ROOMS[1], "L2:jenius-2024", layouts, years)).toEqual({ x: -20 + 14 * 5 + 7, z: 0 });
    expect(roomTarget(ROOMS[2], "L3:voice-ai", layouts, years)).toEqual(layouts.L3.doors![0].at);
    const listed = roomTarget(ROOMS[3], "L3:listed", layouts, years);
    expect(listed.z).toBeLessThan(0);
    expect(listed.x).toBeLessThan(-10);
  });

  it("falls back near the floor label", () => {
    const p = roomTarget(undefined, "L2:unknown", layouts, years);
    expect(p).toEqual({ x: layouts.L2.approach.x + 7, z: layouts.L2.approach.z - 3 });
  });

  it("stops at the floor's list stop for an L4 room without a door (posts on the archive board)", () => {
    expect(layouts.L4.listStop).toBeDefined();
    expect(roomTarget(undefined, "L4:archived-post", layouts, years)).toEqual(layouts.L4.listStop);
  });

  it("drives to every post's own door on L4, hosted or on Medium", () => {
    expect(roomTarget(byId("L4:newest"), "L4:newest", layouts, years)).toEqual(l4Door("L4:newest"));
    expect(roomTarget(byId("L4:oldest"), "L4:oldest", layouts, years)).toEqual(l4Door("L4:oldest"));
    expect(roomTarget(byId("L4:medium-post"), "L4:medium-post", layouts, years)).toEqual(l4Door("L4:medium-post"));
  });

  it("stops at the models and talks stations, the comms terminals and the CV kiosk (their doors)", () => {
    expect(roomTarget(byId("L4:publications"), "L4:publications", layouts, years)).toEqual(l4Door("L4:publications"));
    expect(roomTarget(byId("L4:talks"), "L4:talks", layouts, years)).toEqual(l4Door("L4:talks"));
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
    expect(rover.autopilot?.point.x).toBe(LOBBY.skillsWall.x);
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

  it("drives to a post's door through the host", async () => {
    const { rover, host } = setup();
    await host.driveTo("L4:oldest", { signal: signal(), missionId: "m" });
    expect(rover.autopilot?.point).toEqual(l4Door("L4:oldest"));
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

  it("hands a walk step to the registered walk, else rides to its floor and lists the rooms", async () => {
    const { store, deps, host } = setup();
    const started: string[] = [];
    const off = registerWalkStarter((id) => (id === "journey" ? (started.push(id), true) : false));
    await host.walk("journey", { signal: signal(), missionId: "journey" });
    expect(started).toEqual(["journey"]);
    expect(store.getState().floor).toBe("L1");
    await host.walk("projects", { signal: signal(), missionId: "projects" });
    expect(store.getState().floor).toBe("L3");
    expect(deps.openPalette).toHaveBeenCalledWith("pods");
    await host.walk("writing", { signal: signal(), missionId: "blog" });
    expect(store.getState().floor).toBe("L4");
    expect(deps.openPalette).toHaveBeenLastCalledWith("posts");
    off();
    await host.walk("journey", { signal: signal(), missionId: "journey" });
    expect(started).toEqual(["journey"]);
    expect(store.getState().floor).toBe("L2");
    expect(deps.openPalette).toHaveBeenLastCalledWith("rooms");
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
