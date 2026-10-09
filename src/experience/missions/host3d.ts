import type { FloorId, RoomId } from "@/content/schema";
import type { HQStore } from "@/store/useHQStore";
import { LOBBY, READY_FLOORS } from "../config";
import { directoryStop } from "../floors/labs/layout";
import { postStop } from "../floors/library/layout";
import type { FloorLayout, Vec2 } from "../types";
import type { HostDeps } from "./bridge";
import type { MissionHost, StepContext } from "./host";
import { floorOf, localize, roomPath, type RoomInfo } from "./rooms";

/** Autopilot request the Director fulfils on the next frames. */
export interface AutopilotRequest {
  point: Vec2;
  state: "pending" | "driving" | "done";
}

/** The slice of the shared rover runtime the host talks to. */
export interface RoverChannel {
  autopilot: AutopilotRequest | null;
  /** Set by `finish("cancelled")`; the Director shows o_o for 600 ms and clears it. */
  cancelFlash: boolean;
}

export interface World3D {
  store: HQStore;
  rover: RoverChannel;
  layouts: Record<FloorId, FloorLayout>;
  years: readonly number[];
  /** Resolves on the next frame (injectable for tests). */
  tick?: () => Promise<void>;
}

const DEFAULT_SAY_MS = 2400;

/** Lobby room stops in front of each element (appendix 01 section 2). */
const LOBBY_STOPS: Record<string, Vec2> = {
  profile: { x: LOBBY.hologram.x, z: LOBBY.hologram.z + LOBBY.hologram.radius + 1.8 },
  stats: { x: LOBBY.hologram.x + LOBBY.statsRadius * 0.7, z: LOBBY.hologram.z + LOBBY.statsRadius * 0.7 },
  skills: { x: LOBBY.skillsWall.x, z: LOBBY.skillsWall.z + 2.6 },
  certifications: { x: LOBBY.certWall.x - 2.6, z: LOBBY.certWall.z },
};

/**
 * Where `drive` takes the rover. Rooms with a door trigger stop in its zone (every floor); Lobby
 * rooms have real stops; L3 listed items stop at their wing directory; L4 posts stop in front of their
 * spine (slot from `rooms`, the catalog); placeholder floors use the spot their phase will build on,
 * or a point near the floor label.
 */
export function roomTarget(
  room: RoomInfo | undefined,
  id: RoomId,
  layouts: Record<FloorId, FloorLayout>,
  years: readonly number[],
  rooms: readonly RoomInfo[] = [],
): Vec2 {
  const floor = floorOf(id);
  const layout = layouts[floor];
  const door = layout.doors?.find((d) => d.room === id);
  if (door) return door.at;
  const fallback = { x: layout.approach.x + 7, z: layout.approach.z - 3 };
  if (floor === "L1") return LOBBY_STOPS[id.slice(3)] ?? fallback;
  if (floor === "L2") {
    const index = room?.year !== undefined ? years.indexOf(room.year) : -1;
    if (room?.kind === "workshop") return { x: layout.bounds.maxX - 6, z: 0 };
    return index >= 0 ? { x: -20 + 14 * index + 7, z: 0 } : fallback;
  }
  if (floor === "L3" && room?.wing) return directoryStop(room.wing);
  if (floor === "L4" && room?.kind === "post") {
    // Spines have no door trigger: the slot comes from the catalog's post order (same as the shelves).
    const posts = rooms.filter((r) => r.kind === "post");
    const index = posts.findIndex((r) => r.id === id);
    if (index >= 0) return postStop(index, posts.length);
  }
  return fallback;
}

function untilAborted(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });

/** MissionHost for the 3D tower: store-driven elevator, autopilot drives and the Glass Drawer for rooms. */
export function create3DHost(deps: HostDeps, world: World3D): MissionHost {
  const { store, rover, layouts, years } = world;
  const tick = world.tick ?? nextFrame;
  const byId = new Map(deps.rooms.map((r) => [r.id, r]));

  const waitUntil = async (done: () => boolean, signal: AbortSignal) => {
    while (!signal.aborted && !done()) await tick();
  };

  return {
    isStatic: false,

    async elevator(floor, ctx: StepContext) {
      const s = store.getState();
      if (s.phase === "boot" || s.phase === "intro") s.finishIntro();
      // Leaving for another floor closes the open room (the hologram view blocks the elevator).
      if (s.phase === "room" || s.phase === "hologram") s.closeRoom();
      if (store.getState().floor === floor && !store.getState().ride) return;
      store.getState().requestElevator(floor);
      // A blocked request (overlay phase) would never arrive: fail the step so the mission ends.
      if (!store.getState().ride) throw new Error(`Elevator to ${floor} unavailable in phase ${store.getState().phase}`);
      await waitUntil(() => {
        const now = store.getState();
        return now.floor === floor && now.ride === null;
      }, ctx.signal);
    },

    async driveTo(target, ctx) {
      // Driving to another spot leaves the open room (appendix 02: room to explore on drive away).
      const phase = store.getState().phase;
      if (phase === "room" || phase === "hologram") store.getState().closeRoom();
      const point = typeof target === "string" ? roomTarget(byId.get(target), target, layouts, years, deps.rooms) : target;
      const request: AutopilotRequest = { point, state: "pending" };
      rover.autopilot = request;
      await waitUntil(() => request.state === "done" || rover.autopilot !== request, ctx.signal);
    },

    async openRoom(id, tab) {
      const room = byId.get(id);
      // Built floors open the Glass Drawer in 3D; floors without 3D content open the room page.
      if (READY_FLOORS.includes(room?.floor ?? floorOf(id))) {
        store.getState().openRoom(id, tab);
        return;
      }
      store.getState().markVisited(id);
      if (room) deps.navigate(localize(deps.locale, roomPath(room, tab)));
    },

    async say(text, ms, ctx) {
      const duration = ms ?? DEFAULT_SAY_MS;
      deps.say(text[deps.locale], duration);
      await untilAborted(duration, ctx.signal);
    },

    async openPalette(filter) {
      deps.openPalette(filter);
    },

    finish(status) {
      if (status !== "cancelled") return;
      rover.autopilot = null;
      rover.cancelFlash = true;
      store.getState().cancelRide();
    },
  };
}
