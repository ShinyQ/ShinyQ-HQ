import type { Locale, RoomId } from "@/content/schema";
import type { MissionHost, PaletteFilter } from "./host";
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
const listeners = new Set<(state: MissionState) => void>();

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
  return () => {
    off();
    if (runner === next) runner = null;
  };
}

/** Manual input cancels a running mission (appendix 02 section 3). */
export function cancelMission() {
  runner?.cancel();
}

export function onMissionState(listener: (state: MissionState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The 3D experience opens the Rover Terminal itself after the intro, so the page must not. */
export function claimAutoOpen(claimed: boolean) {
  autoOpenClaimed = claimed;
}

export function isAutoOpenClaimed() {
  return autoOpenClaimed;
}
