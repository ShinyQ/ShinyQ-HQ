import { useStore } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { DrawerTab, FloorId, Locale, RoomId } from "@/content/schema";
import { FLOOR_IDS, floorIndex } from "@/experience/config";
import type { Ride } from "@/experience/tower/elevator";
import type { GpuTier, RoverFace, ViewportClass } from "@/experience/types";

export type Phase =
  | "boot"
  | "intro"
  | "explore"
  | "terminal"
  | "palette"
  | "autopilot"
  | "elevator"
  | "room"
  | "hologram"
  | "quick"
  | "static";

export interface RoverState {
  x: number;
  z: number;
  heading: number;
  speed: number;
  face: RoverFace;
  status?: string;
}

export interface MissionState {
  id: string;
  step: number;
  status: "idle" | "running" | "done" | "cancelled";
}

export interface DeviceState {
  viewport: ViewportClass;
  camera: ViewportClass;
  coarse: boolean;
}

export type ElevatorTarget = "up" | "down" | FloorId;

/** Runtime store (appendix 06 section 2, plus the documented Phase 1 additions). */
export interface HQState {
  phase: Phase;
  tier: GpuTier;
  locale: Locale;
  sound: boolean;
  floor: FloorId;
  rover: RoverState;
  activeRoom: RoomId | null;
  drawerTab: DrawerTab;
  mission: MissionState | null;
  visited: RoomId[];
  firstVisit: boolean;
  // Additions
  ride: Ride | null;
  device: DeviceState;
  reducedMotion: boolean;
  notice: string | null;

  setPhase: (phase: Phase) => void;
  finishIntro: () => void;
  goToFloor: (floor: FloorId) => void;
  requestElevator: (target: ElevatorTarget) => void;
  setRide: (ride: Ride | null) => void;
  cancelRide: () => void;
  arriveFloor: (floor: FloorId) => void;
  openRoom: (room: RoomId) => void;
  closeRoom: () => void;
  startMission: (id: string) => void;
  /** Mirrors the mission runner state without changing the phase (the rover keeps driving in explore). */
  setMission: (mission: MissionState | null) => void;
  cancelMission: () => void;
  markVisited: (room: RoomId) => void;
  setLocale: (locale: Locale) => void;
  toggleSound: () => void;
  setTier: (tier: GpuTier) => void;
  setRover: (rover: Partial<RoverState>) => void;
  setDevice: (device: Partial<DeviceState>) => void;
  setReducedMotion: (reduced: boolean) => void;
  notify: (notice: string | null) => void;
  /** Starts directly in explore on a floor (deep link or language switch resume). */
  resume: (floor: FloorId, at?: { x: number; z: number }) => void;
}

export const STORE_KEY = "hq:v1";
const BLOCKED_PHASES: readonly Phase[] = ["boot", "intro", "static", "palette", "quick", "terminal"];

/** Spawn at the Lobby spawn point, turned toward the default follow camera so the face greets the visitor. */
export const initialRover: RoverState = { x: 0, z: 6, heading: Math.PI / 4, speed: 0, face: "idle" };

function resolveTarget(base: FloorId, target: ElevatorTarget): FloorId | undefined {
  if (target === "up") return FLOOR_IDS[floorIndex(base) + 1];
  if (target === "down") return FLOOR_IDS[floorIndex(base) - 1];
  return target;
}

export function createHQStore(storage?: StateStorage) {
  return createStore<HQState>()(
    persist(
      (set, get) => ({
        phase: "boot",
        tier: "lite",
        locale: "en",
        sound: false,
        floor: "L1",
        rover: initialRover,
        activeRoom: null,
        drawerTab: "overview",
        mission: null,
        visited: [],
        firstVisit: true,
        ride: null,
        device: { viewport: "desktop", camera: "desktop", coarse: false },
        reducedMotion: false,
        notice: null,

        setPhase: (phase) => set({ phase }),
        finishIntro: () => set({ phase: "explore", firstVisit: false }),
        goToFloor: (floor) => get().requestElevator(floor),
        requestElevator: (target) => {
          const { phase, ride, floor } = get();
          if (BLOCKED_PHASES.includes(phase)) return;
          if (ride && ride.stage !== "toDoor") return;
          const to = resolveTarget(ride ? ride.to : floor, target);
          if (!to) return;
          if (ride) {
            if (to === ride.from) set({ ride: null, phase: "explore" });
            else if (to !== ride.to) set({ ride: { ...ride, to } });
            return;
          }
          if (to === floor) return;
          set({ ride: { from: floor, to, stage: "toDoor", t: 0 }, phase: "elevator", activeRoom: null });
        },
        setRide: (ride) => set({ ride }),
        cancelRide: () => {
          const { ride } = get();
          if (ride?.stage === "toDoor") set({ ride: null, phase: "explore" });
        },
        arriveFloor: (floor) => set({ floor, ride: null, phase: "explore" }),
        openRoom: (room) => {
          get().markVisited(room);
          set({ activeRoom: room, phase: "room", drawerTab: "overview" });
        },
        closeRoom: () => set({ activeRoom: null, phase: "explore" }),
        startMission: (id) => set({ mission: { id, step: 0, status: "running" }, phase: "autopilot" }),
        setMission: (mission) => set({ mission }),
        cancelMission: () => {
          const { mission } = get();
          if (mission?.status === "running") set({ mission: { ...mission, status: "cancelled" }, phase: "explore" });
        },
        markVisited: (room) => {
          const { visited } = get();
          if (!visited.includes(room)) set({ visited: [...visited, room] });
        },
        setLocale: (locale) => set({ locale }),
        toggleSound: () => set({ sound: !get().sound }),
        setTier: (tier) => set(tier === "static" ? { tier, phase: "static", ride: null } : { tier }),
        setRover: (rover) => set({ rover: { ...get().rover, ...rover } }),
        setDevice: (device) => set({ device: { ...get().device, ...device } }),
        setReducedMotion: (reducedMotion) => set({ reducedMotion }),
        notify: (notice) => set({ notice }),
        resume: (floor, at) =>
          set({
            floor,
            phase: "explore",
            ride: null,
            firstVisit: false,
            rover: { ...get().rover, ...(at ?? {}), speed: 0 },
          }),
      }),
      {
        name: STORE_KEY,
        version: 1,
        storage: createJSONStorage(() => storage ?? localStorage),
        // `sound` is owned and persisted by the audio engine (localStorage "hq:sound"); the store mirrors it.
        partialize: ({ visited, firstVisit, locale }) => ({ visited, firstVisit, locale }),
      },
    ),
  );
}

export type HQStore = ReturnType<typeof createHQStore>;

let singleton: HQStore | undefined;

/** Browser singleton. Only touch it from client components. */
export function getHQStore(): HQStore {
  singleton ??= createHQStore();
  return singleton;
}

export function useHQStore<T>(selector: (state: HQState) => T): T {
  return useStore(getHQStore(), selector);
}
