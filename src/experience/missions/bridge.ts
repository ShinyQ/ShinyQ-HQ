import type { DrawerTab, Locale, MissionStep, RoomId } from "@/content/schema";
import { canonicalRoom } from "./roomAliases";
import type { MissionHost, MissionStatus, PaletteFilter } from "./host";
import type { RoomInfo } from "./rooms";
import type { MissionRunner, MissionState } from "./runner";

/** What MissionHud hands to whichever host is active. */
export interface HostDeps {
  locale: Locale;
  rooms: readonly RoomInfo[];
  /** Client-side navigation with a locale-prefixed href. */
  navigate: (href: string) => void;
  /** HUD toast (already localized). */
  say: (text: string, ms: number) => void;
  openPalette: (filter?: PaletteFilter) => void;
}

export type HostFactory = (deps: HostDeps) => MissionHost;

/**
 * Registry between the always-mounted MissionHud (static wiring in the locale layout) and the 3D
 * experience, which mounts later and only where WebGL is available. While the experience is open,
 * missions run against its host; otherwise against the static host.
 */
let factory: HostFactory | null = null;
let cache: { deps: HostDeps; source: HostFactory; host: MissionHost } | null = null;
let visited: (() => readonly RoomId[]) | null = null;
let runner: MissionRunner | null = null;
let autoOpenClaimed = false;
let requestRunner: (() => void) | null = null;
const listeners = new Set<(state: MissionState) => void>();
const waiting = new Set<(runner: MissionRunner | null) => void>();
/** How long a cross-floor link or ad hoc step list waits for the runner (MissionHud loads its index on demand or at idle). */
const RUNNER_WAIT_MS = 5000;

/** The active runner, or the next one registered within `timeoutMs` (null after that). */
function whenRunner(timeoutMs = RUNNER_WAIT_MS): Promise<MissionRunner | null> {
  if (runner) return Promise.resolve(runner);
  requestRunner?.();
  return new Promise((resolve) => {
    const done = (next: MissionRunner | null) => {
      clearTimeout(timer);
      waiting.delete(done);
      resolve(next);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    waiting.add(done);
  });
}

/** MissionHud registers how to get a runner sooner (load the HUD index now) when a caller waits for one. */
export function onRunnerRequest(request: () => void): () => void {
  requestRunner = request;
  return () => {
    if (requestRunner === request) requestRunner = null;
  };
}

export function register3DHost(next: HostFactory, visitedRooms: () => readonly RoomId[]): () => void {
  factory = next;
  visited = visitedRooms;
  return () => {
    if (factory !== next) return;
    factory = null;
    visited = null;
    cache = null;
  };
}

/** The 3D host when registered, else `fallback`. */
export function resolveHost(deps: HostDeps, fallback: MissionHost): MissionHost {
  if (!factory) return fallback;
  if (!cache || cache.deps !== deps || cache.source !== factory) cache = { deps, source: factory, host: factory(deps) };
  return cache.host;
}

export function visitedRooms(): readonly RoomId[] | null {
  return visited ? visited() : null;
}

export function registerRunner(next: MissionRunner): () => void {
  runner = next;
  const off = next.subscribe((state) => listeners.forEach((l) => l(state)));
  [...waiting].forEach((resolve) => resolve(next));
  return () => {
    off();
    if (runner === next) runner = null;
  };
}

/** Elevator, drive and open for any room through the active runner ("See the case study" links). */
export function goToRoom(id: RoomId, tab?: DrawerTab) {
  const room = canonicalRoom(id);
  if (runner) void runner.goTo(room, tab);
  else void whenRunner().then((next) => next?.goTo(room, tab));
}

/** Runs ad hoc steps through the active runner. Resolves "cancelled" when no runner shows up. */
export function runMissionSteps(id: string, steps: readonly MissionStep[]): Promise<MissionStatus> {
  if (runner) return runner.runSteps(id, steps);
  return whenRunner().then((next) => (next ? next.runSteps(id, steps) : "cancelled"));
}

/** Manual input cancels a running mission (appendix 02 section 3). */
export function cancelMission() {
  runner?.cancel();
}

export function onMissionState(listener: (state: MissionState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Only the 3D Lobby opens the Rover Terminal on its own (Director, after the intro on the first visit); the gate claims it while the tower is open. */
export function claimAutoOpen(claimed: boolean) {
  autoOpenClaimed = claimed;
}

export function isAutoOpenClaimed() {
  return autoOpenClaimed;
}
