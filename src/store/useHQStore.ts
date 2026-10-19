import { useStore } from "zustand";
import { canonicalRoom } from "@/experience/missions/roomAliases";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { DrawerTab, FloorId, Locale, RoomId } from "@/content/schema";
import { canEnterFloor, floorProgress, PUBLIC_FLOOR_COUNT, withFloorSeen } from "@/experience/b1";
import { FLOOR_IDS, floorIndex } from "@/experience/floorOrder";
import { LOBBY_SPAWN, LOBBY_SPAWN_HEADING } from "@/experience/floors/lobby/spawn";
import type { Ride } from "@/experience/tower/elevator";
import type { PickerRequest } from "@/experience/nav/pads";
import type { Beam } from "@/experience/nav/teleport";
import type { HoverState } from "@/experience/interact/pick";
import type { GpuTier, RoverFace, ViewportClass } from "@/experience/types";
import type { ReactorRingId } from "@/content/tech-rings";
import { isPublicFloor } from "@/lib/floors";
import { applyMotionAttr, DEFAULT_MOTION, isMotionPref, migrateMotion, resolveReducedMotion, type MotionPref } from "@/lib/motion";
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

/** The L3 Tech Reactor pick: a tech and the pods (slugs, site order) that use it. */
export interface ReactorTech {
  slug: string;
  name: string;
  ring: ReactorRingId;
  /** Projects using it (docked and listed). */
  count: number;
  pods: string[];
}

export interface ReactorState {
  /** Ring shown in the Tech Reactor drawer. */
  ring: ReactorRingId;
  /** Selected tech: its pods light up on L3 (`#labs-tech=<slug>`). */
  tech: ReactorTech | null;
  /** Surprise me counter: each bump spins the rings once and drives to a random pod. */
  spin: number;
}

/** The L4 Topic Constellation pick: a topic and the L4 rooms its pieces live in. */
export interface TopicPick {
  slug: string;
  /** Label in the tower's locale. */
  name: string;
  /** Posts, papers, models and talks on the topic. */
  count: number;
  rooms: RoomId[];
}

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
  /** Visitor preference (HUD Motion control, Cmd-K): System follows the OS, Full and Reduced override it. Default Full (owner decision 2026-10-14). Persisted. */
  motion: MotionPref;
  /** `prefers-reduced-motion: reduce` as the OS reports it. */
  systemReducedMotion: boolean;
  notice: string | null;
  /** README easter egg: the drawer shows the terminal view of the room (Phase 4). */
  readme: boolean;
  /** Floor pad picker over the world: floors (elevator call pad) or years (L2 teleporter). */
  picker: PickerRequest | null;
  /** Beam in progress (L2 year teleports, Express Return pads, far floor changes into the car), advanced by the Director. */
  beam: Beam | null;
  /** Point-and-go: the target under the mouse (`via: "pointer"`) or picked by a first tap (`via: "tap"`). Not persisted. */
  hover: HoverState | null;
  /** The one-time "click a glowing object" hint is showing (`interact/missed.ts`). Not persisted. */
  pointHint: boolean;
  /** L3 Tech Reactor: ring, selected tech and the Surprise me counter. Not persisted (the URL hash carries the tech). */
  reactor: ReactorState;
  /** L4 Topic Constellation: the selected topic. Not persisted (the URL hash carries it). */
  topics: { topic: TopicPick | null };
  /** Public floors the rover has reached in explore, in order (persisted). Five unlock B1 (`withFloorSeen`). */
  floorsSeen: FloorId[];
  /**
   * B1 Engine Room is reachable: the fifth public floor (persisted once all five are seen) or the dev and test
   * flag `?unlock=b1` (`unlockB1`, session only: never written to storage).
   */
  b1Unlocked: boolean;
  /** The one-time unlock moment is due (EngineUnlockLayer plays it, then clears it). Not persisted. */
  b1Moment: boolean;

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
  setReactorRing: (ring: ReactorRingId) => void;
  /** Selects a tech and switches the drawer to its ring. */
  selectReactorTech: (tech: ReactorTech) => void;
  clearReactorTech: () => void;
  spinReactor: () => void;
  selectTopic: (topic: TopicPick) => void;
  /** Unlocks B1 for this session only (the dev and test flag): the elevator serves it and the floor rows list it. */
  unlockB1: () => void;
  /** Records a reached floor; the fifth public floor unlocks B1 and starts the moment. */
  markFloorSeen: (floor: FloorId) => void;
  clearB1Moment: () => void;
  clearTopic: () => void;
  /** Starts directly in explore on a floor (deep link or language switch resume). */
  resume: (floor: FloorId, at?: { x: number; z: number; heading?: number }) => void;
}

export const STORE_KEY = "hq:v1";

/** Keys the store persists (appendix 06 section 2, plus `motion`); `sound` is persisted by the audio engine. */
type Persisted = Pick<HQState, "visited" | "firstVisit" | "locale" | "motion" | "floorsSeen" | "b1Unlocked">;
/**
 * Version 2 added `motion`; version 3 made Full the default (owner decision 2026-10-14): older payloads
 * migrate a stored or missing System to Full and keep Reduced (`migrateMotion`). `floorsSeen` and `b1Unlocked`
 * were added in version 3 without a bump: `merge` fills missing keys and drops invalid ones.
 */
export const STORE_VERSION = 3;

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

/** Spawn at the Lobby spawn point (the kiosk stop), facing the Rover menu screen (owner 2026-10-14). */
export const initialRover: RoverState = { x: LOBBY_SPAWN.x, z: LOBBY_SPAWN.z, heading: LOBBY_SPAWN_HEADING, speed: 0, face: "idle" };

function resolveTarget(base: FloorId, target: ElevatorTarget, b1Unlocked: boolean): FloorId | undefined {
  const to = target === "up" ? FLOOR_IDS[floorIndex(base) + 1] : target === "down" ? FLOOR_IDS[floorIndex(base) - 1] : target;
  return to && canEnterFloor(to, b1Unlocked) ? to : undefined;
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
        reducedMotion: resolveReducedMotion(DEFAULT_MOTION, prefersReducedMotion()),
        motion: DEFAULT_MOTION,
        systemReducedMotion: prefersReducedMotion(),
        notice: null,
        readme: false,
        picker: null,
        beam: null,
        hover: null,
        pointHint: false,
        reactor: { ring: "ai", tech: null, spin: 0 },
        topics: { topic: null },
        floorsSeen: [],
        b1Unlocked: false,
        b1Moment: false,

        setPhase: (phase) => set({ phase }),
        finishIntro: () => set({ phase: "explore", firstVisit: false }),
        goToFloor: (floor) => get().requestElevator(floor),
        requestElevator: (target) => {
          const { phase, ride, floor } = get();
          if (BLOCKED_PHASES.includes(phase)) return;
          if (ride && ride.stage !== "toDoor") return;
          const to = resolveTarget(ride ? ride.to : floor, target, get().b1Unlocked);
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
        openRoom: (id, tab) => {
          // Rooms that moved (RF:visits is now L1:visits) open under their current id.
          const room = canonicalRoom(id);
          // A locked B1 never opens a station (a Back into a stale history entry, a stray link): no drawer, no fetch.
          if (!canEnterFloor(room.slice(0, room.indexOf(":")) as FloorId, get().b1Unlocked)) return;
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
        setReactorRing: (ring) => {
          if (get().reactor.ring !== ring) set({ reactor: { ...get().reactor, ring } });
        },
        selectReactorTech: (tech) => set({ reactor: { ...get().reactor, tech, ring: tech.ring } }),
        clearReactorTech: () => {
          if (get().reactor.tech) set({ reactor: { ...get().reactor, tech: null } });
        },
        spinReactor: () => set({ reactor: { ...get().reactor, spin: get().reactor.spin + 1 } }),
        selectTopic: (topic) => set({ topics: { topic } }),
        unlockB1: () => set({ b1Unlocked: true }),
        markFloorSeen: (floor) => {
          const patch = withFloorSeen(get(), floor);
          if (patch) set(patch);
        },
        clearB1Moment: () => set({ b1Moment: false }),
        clearTopic: () => {
          if (get().topics.topic) set({ topics: { topic: null } });
        },
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
        // The session-only flag unlock is not stored: `b1Unlocked` persists only once all five public floors were seen.
        partialize: ({ visited, firstVisit, locale, motion, floorsSeen, b1Unlocked }): Persisted => ({
          visited,
          firstVisit,
          locale,
          motion,
          floorsSeen,
          b1Unlocked: b1Unlocked && floorProgress(floorsSeen).seen === PUBLIC_FLOOR_COUNT,
        }),
        migrate: (persisted, version): Persisted => {
          const saved = (persisted ?? {}) as Persisted;
          return version < STORE_VERSION ? { ...saved, motion: migrateMotion(saved.motion, version) } : saved;
        },
        merge: (persisted, current) => {
          const saved = (persisted ?? {}) as Partial<Persisted>;
          const motion = isMotionPref(saved.motion) ? saved.motion : DEFAULT_MOTION;
          const floorsSeen = Array.isArray(saved.floorsSeen) ? saved.floorsSeen.filter((f): f is FloorId => typeof f === "string" && isPublicFloor(f as FloorId)) : [];
          const b1Unlocked = saved.b1Unlocked === true && floorProgress(floorsSeen).seen === PUBLIC_FLOOR_COUNT;
          return { ...current, ...saved, motion, floorsSeen, b1Unlocked, reducedMotion: resolveReducedMotion(motion, current.systemReducedMotion) };
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
