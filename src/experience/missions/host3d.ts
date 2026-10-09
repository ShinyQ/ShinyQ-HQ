import type { FloorId, RoomId } from "@/content/schema";
import type { HQStore } from "@/store/useHQStore";
import { LOBBY, READY_FLOORS } from "../config";
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
  stats: { x: LOBBY.hologram.x + 5.5, z: LOBBY.hologram.z + 4.5 },
  skills: { x: LOBBY.skillsWall.x, z: LOBBY.skillsWall.z + 2.6 },
  certifications: { x: LOBBY.certWall.x - 2.6, z: LOBBY.certWall.z },
};

/**
 * Where `drive` takes the rover. Lobby rooms have real stops; placeholder floors use the spot their
 * phase will build on (year segment on L2, wing side on L3), or a point near the floor label.
 */
export function roomTarget(room: RoomInfo | undefined, id: RoomId, layouts: Record<FloorId, FloorLayout>, years: readonly number[]): Vec2 {
  const floor = floorOf(id);
  const layout = layouts[floor];
  const fallback = { x: layout.approach.x + 7, z: layout.approach.z - 3 };
  if (floor === "L1") return LOBBY_STOPS[id.slice(3)] ?? fallback;
  if (floor === "L2") {
    const index = room?.year !== undefined ? years.indexOf(room.year) : -1;
    if (room?.kind === "workshop") return { x: layout.bounds.maxX - 6, z: 0 };
    return index >= 0 ? { x: -20 + 14 * index + 7, z: 0 } : fallback;
  }
  if (floor === "L3" && room?.wing) return { x: room.wing === "software" ? -15 : 15, z: 0 };
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

/** MissionHost for the 3D tower: store-driven elevator, autopilot drives, room stubs until the Phase 4 drawer. */
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
      if (store.getState().floor === floor && !store.getState().ride) return;
      store.getState().requestElevator(floor);
      await waitUntil(() => {
        const now = store.getState();
        return now.floor === floor && now.ride === null;
      }, ctx.signal);
    },

    async driveTo(target, ctx) {
      const point = typeof target === "string" ? roomTarget(byId.get(target), target, layouts, years) : target;
      const request: AutopilotRequest = { point, state: "pending" };
      rover.autopilot = request;
      await waitUntil(() => request.state === "done" || rover.autopilot !== request, ctx.signal);
    },

    async openRoom(id, tab) {
      store.getState().markVisited(id);
      const room = byId.get(id);
      // Built floors keep the visitor in 3D; the drawer arrives in Phase 4. Elsewhere open the room page.
      if (!room || READY_FLOORS.includes(room.floor)) return;
      deps.navigate(localize(deps.locale, roomPath(room, tab)));
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
