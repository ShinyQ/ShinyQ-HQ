import { useStore } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { DrawerTab, FloorId, Locale, RoomId } from "@/content/schema";
import { FLOOR_IDS, floorIndex, LOBBY } from "@/experience/config";
import type { Ride } from "@/experience/tower/elevator";
import type { PickerRequest } from "@/experience/nav/pads";
import type { Beam } from "@/experience/nav/teleport";
import type { HoverState } from "@/experience/interact/pick";
import type { GpuTier, RoverFace, ViewportClass } from "@/experience/types";
import { applyMotionAttr, isMotionPref, resolveReducedMotion, type MotionPref } from "@/lib/motion";
import { prefersReducedMotion } from "@/lib/reduced-motion";
import { skipUnchanged } from "./persist-storage";

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
  /** Effective reduced motion: `resolveReducedMotion(motion, systemReducedMotion)`. Every 3D consumer reads this. */
  reducedMotion: boolean;
  /** Visitor preference (HUD Motion control, Cmd-K): System follows the OS, Full and Reduced override it. Persisted. */
  motion: MotionPref;
  /** `prefers-reduced-motion: reduce` as the OS reports it. */
  systemReducedMotion: boolean;
  notice: string | null;
  /** README easter egg: the drawer shows the terminal view of the room (Phase 4). */
  readme: boolean;
  /** Floor pad picker over the world: floors (elevator call pad) or years (L2 teleporter). */
  picker: PickerRequest | null;
  /** L2 teleport beam in progress, advanced by the Director. */
  beam: Beam | null;
  /** Point-and-go: the target under the mouse (`via: "pointer"`) or picked by a first tap (`via: "tap"`). Not persisted. */
  hover: HoverState | null;
  /** The one-time "click a glowing object" hint is showing (`interact/missed.ts`). Not persisted. */
  pointHint: boolean;

  setPhase: (phase: Phase) => void;
  finishIntro: () => void;
  goToFloor: (floor: FloorId) => void;
  requestElevator: (target: ElevatorTarget) => void;
  setRide: (ride: Ride | null) => void;
  cancelRide: () => void;
  arriveFloor: (floor: FloorId) => void;
  /** Opens the Glass Drawer on a room (phase "room"), optionally on a tab. */
  openRoom: (room: RoomId, tab?: DrawerTab) => void;
  closeRoom: () => void;
  setDrawerTab: (tab: DrawerTab) => void;
  toggleReadme: (on?: boolean) => void;
  /** Hologram view of the active room (hero pods). Phase "hologram"; closing returns to "room". */
  openHologram: () => void;
  closeHologram: () => void;
  startMission: (id: string) => void;
  /** Mirrors the mission runner state without changing the phase (the rover keeps driving in explore). */
  setMission: (mission: MissionState | null) => void;
  cancelMission: () => void;
  markVisited: (room: RoomId) => void;
  setLocale: (locale: Locale) => void;
  toggleSound: () => void;
  setTier: (tier: GpuTier) => void;
  /** After a WebGL crash, right before the canvas remounts: explore again with the tier the gate detected. */
  recover: (tier: GpuTier) => void;
  setRover: (rover: Partial<RoverState>) => void;
  setDevice: (device: Partial<DeviceState>) => void;
  /** Records the OS flag (`prefers-reduced-motion`) and re-resolves `reducedMotion`. */
  setReducedMotion: (systemReduced: boolean) => void;
  /** Sets the Motion preference, re-resolves `reducedMotion` and mirrors it on `html[data-motion]`. */
  setMotion: (motion: MotionPref) => void;
  notify: (notice: string | null) => void;
  /** Opens a pad picker; only while exploring, with no ride and no beam running. */
  openPicker: (picker: PickerRequest) => void;
  closePicker: () => void;
  setBeam: (beam: Beam | null) => void;
  /** Sets the point-and-go target; a repeat of the same target and source is ignored (pointer moves fire often). */
  setHover: (hover: HoverState | null) => void;
  setPointHint: (on: boolean) => void;
  /** Starts directly in explore on a floor (deep link or language switch resume). */
  resume: (floor: FloorId, at?: { x: number; z: number }) => void;
}

export const STORE_KEY = "hq:v1";

/** Keys the store persists (appendix 06 section 2, plus `motion`); `sound` is persisted by the audio engine. */
type Persisted = Pick<HQState, "visited" | "firstVisit" | "locale" | "motion">;
/** Version 2 added `motion` (version 1 payloads migrate to System). */
export const STORE_VERSION = 2;

/** Mirror tolerance for rover numbers (world units, radians, u/s): far below anything a reader shows. */
export const POSE_EPSILON = 1e-4;

/** True when `patch` would not change the mirrored rover (the Director's 10 Hz sync while it is parked). */
export function sameRover(current: RoverState, patch: Partial<RoverState>): boolean {
  for (const key of Object.keys(patch) as (keyof RoverState)[]) {
    const a = current[key];
    const b = patch[key];
    if (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) > POSE_EPSILON : a !== b) return false;
  }
  return true;
}
const BLOCKED_PHASES: readonly Phase[] = ["boot", "intro", "static", "palette", "quick", "terminal", "hologram"];

/** Spawn at the Lobby spawn point, turned toward the default follow camera so the face greets the visitor. */
export const initialRover: RoverState = { x: LOBBY.spawn.x, z: LOBBY.spawn.z, heading: Math.PI / 4, speed: 0, face: "idle" };

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
        reducedMotion: prefersReducedMotion(),
        motion: "system",
        systemReducedMotion: prefersReducedMotion(),
        notice: null,
        readme: false,
        picker: null,
        beam: null,
        hover: null,
        pointHint: false,

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
          set({ ride: { from: floor, to, stage: "toDoor", t: 0 }, phase: "elevator", activeRoom: null, picker: null });
        },
        setRide: (ride) => set({ ride }),
        cancelRide: () => {
          const { ride } = get();
          if (ride?.stage === "toDoor") set({ ride: null, phase: "explore" });
        },
        arriveFloor: (floor) => set({ floor, ride: null, phase: "explore" }),
        openRoom: (room, tab) => {
          get().markVisited(room);
          const same = get().activeRoom === room;
          set({ activeRoom: room, phase: "room", drawerTab: tab ?? (same ? get().drawerTab : "overview"), readme: same && get().readme });
        },
        closeRoom: () => set({ activeRoom: null, phase: "explore", readme: false }),
        setDrawerTab: (drawerTab) => set({ drawerTab }),
        toggleReadme: (on) => set({ readme: on ?? !get().readme }),
        openHologram: () => {
          if (get().activeRoom) set({ phase: "hologram", readme: false });
        },
        closeHologram: () => {
          if (get().phase === "hologram") set({ phase: get().activeRoom ? "room" : "explore" });
        },
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
        recover: (tier) => {
          const { phase } = get();
          set({ tier, ride: null, beam: null, picker: null, phase: phase === "static" || phase === "elevator" ? "explore" : phase });
        },
        setRover: (rover) => {
          const current = get().rover;
          if (!sameRover(current, rover)) set({ rover: { ...current, ...rover } });
        },
        setDevice: (device) => set({ device: { ...get().device, ...device } }),
        setReducedMotion: (systemReducedMotion) => set({ systemReducedMotion, reducedMotion: resolveReducedMotion(get().motion, systemReducedMotion) }),
        setMotion: (motion) => {
          set({ motion, reducedMotion: resolveReducedMotion(motion, get().systemReducedMotion) });
          applyMotionAttr(motion);
        },
        notify: (notice) => set({ notice }),
        openPicker: (picker) => {
          const { phase, ride, beam } = get();
          if (phase !== "explore" || ride || beam) return;
          set({ picker });
        },
        closePicker: () => set({ picker: null }),
        setBeam: (beam) => set({ beam }),
        setHover: (hover) => {
          const current = get().hover;
          if (current?.item.id === hover?.item.id && current?.via === hover?.via) return;
          set({ hover });
        },
        setPointHint: (pointHint) => set({ pointHint }),
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
        version: STORE_VERSION,
        storage: skipUnchanged(createJSONStorage<Persisted>(() => storage ?? localStorage)),
        // `sound` is owned and persisted by the audio engine (localStorage "hq:sound"); the store mirrors it.
        partialize: ({ visited, firstVisit, locale, motion }): Persisted => ({ visited, firstVisit, locale, motion }),
        migrate: (persisted, version): Persisted => (version < 2 ? { ...(persisted as Persisted), motion: "system" } : (persisted as Persisted)),
        merge: (persisted, current) => {
          const saved = (persisted ?? {}) as Partial<Persisted>;
          const motion = isMotionPref(saved.motion) ? saved.motion : "system";
          return { ...current, ...saved, motion, reducedMotion: resolveReducedMotion(motion, current.systemReducedMotion) };
        },
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
