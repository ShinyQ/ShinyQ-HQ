import { useSyncExternalStore } from "react";
import type * as BeaconChunk from "./beaconChunk";
import type * as WatchChunk from "./watchChunk";

/**
 * Main-path loader of the office watch chunk (`./watchChunk.ts`: the signal, the 30 s watch, the minimap cue; idle
 * on L1, in the session total) and the beacon chunk (`./beaconChunk.ts`: the beacon mesh; on the first ask, outside
 * it), plus the one bit the minimap's label needs before either loads. These two import() calls are the only
 * references to the chunks; a failed import forgets its promise, so the next call retries.
 */
export type OfficeWatchModule = typeof WatchChunk;
export type OfficeBeaconModule = typeof BeaconChunk;

const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

let watch: OfficeWatchModule | null = null;
let beacon: OfficeBeaconModule | null = null;
let pendingWatch: Promise<OfficeWatchModule> | null = null;
let pendingBeacon: Promise<OfficeBeaconModule> | null = null;

/** Loads the watch chunk once per page (OfficeMount on L1 once the first frame went idle, the scene chunk, `__hq.office`). */
export function loadOfficeWatch(): Promise<OfficeWatchModule> {
  pendingWatch ??= import("./watchChunk").then(
    (m) => {
      watch = m;
      notify();
      return m;
    },
    (error: unknown) => {
      pendingWatch = null;
      throw error;
    },
  );
  return pendingWatch;
}

/** Loads the beacon chunk once per page (the watch chunk, the first time a Rover needs Kurniadi). */
export function loadOfficeBeacon(): Promise<OfficeBeaconModule> {
  pendingBeacon ??= import("./beaconChunk").then(
    (m) => {
      beacon = m;
      notify();
      return m;
    },
    (error: unknown) => {
      pendingBeacon = null;
      throw error;
    },
  );
  return pendingBeacon;
}

const getWatch = () => watch;
const getBeacon = () => beacon;
const none = () => null;

export function useOfficeWatchModule(): OfficeWatchModule | null {
  return useSyncExternalStore(subscribe, getWatch, none);
}

export function useOfficeBeaconModule(): OfficeBeaconModule | null {
  return useSyncExternalStore(subscribe, getBeacon, none);
}

/** Whether a Rover needs Kurniadi, mirrored by the watch chunk from the signal (the minimap's label). */
export const officeAsks = { on: false };

export function setOfficeAsks(on: boolean): void {
  if (officeAsks.on === on) return;
  officeAsks.on = on;
  notify();
}

const getAsks = () => officeAsks.on;
const off = () => false;

export function useOfficeAsks(): boolean {
  return useSyncExternalStore(subscribe, getAsks, off);
}

/** `__hq.office.watchNow()` (Playwright): loads the watch chunk, then one tick of the running watch (its usual gates apply). */
export const officeWatchNow = (): Promise<void> => loadOfficeWatch().then((m) => m.officeWatchTick());
