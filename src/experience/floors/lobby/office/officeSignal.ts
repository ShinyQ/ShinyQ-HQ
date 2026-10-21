import { useSyncExternalStore } from "react";

/**
 * Agent Office signal (design 2026-10-20 section 5.3; lazy, shared by the watch, scene and beacon chunks): whether a Rover needs Kurniadi (the beacon and the
 * minimap cue) and when the last production deploy succeeded (stage B's beam). Fed by the office watch's small fetch,
 * or by the office scene's own feed while its poller runs (`sceneFeeding`), so there is one request stream.
 */
export interface OfficeSignal {
  needsKurniadi: boolean;
  /** Desk slots whose Rover is asking (state `input`). */
  asking: number[];
  deployAt: number | null;
  sceneFeeding: boolean;
  /** Epoch ms of the last good answer (the 60 s keep-last window). */
  goodAt: number;
}

export const officeSignal: OfficeSignal = { needsKurniadi: false, asking: [], deployAt: null, sceneFeeding: false, goodAt: 0 };
const listeners = new Set<() => void>();
/** The keep-last window: a raised signal goes dark this long after its last good answer (ms). */
const KEEP_MS = 60_000;
let stale: ReturnType<typeof setTimeout> | undefined;

/**
 * Patches the signal and re-arms its expiry: whoever fed it (the watch or the scene) and whether or not either still
 * runs (riding off L1 unmounts both), `asking` and `deployAt` clear 60 s after `goodAt`, so the beacon is never stale.
 */
export function setOfficeSignal(patch: Partial<OfficeSignal>): void {
  Object.assign(officeSignal, patch);
  officeSignal.needsKurniadi = officeSignal.asking.length > 0;
  clearTimeout(stale);
  if (officeSignal.needsKurniadi || officeSignal.deployAt !== null) stale = setTimeout(() => setOfficeSignal({ asking: [], deployAt: null }), officeSignal.goodAt + KEEP_MS - Date.now());
  for (const l of listeners) l();
}

export const subscribeOfficeSignal = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/**
 * `select` must return a primitive or a field of the signal (a fresh object each call would re-render forever). The
 * server snapshot is the same read: nothing ever feeds the signal before hydration, so it is still the dark default.
 */
export function useOfficeSignal<T>(select: (s: OfficeSignal) => T): T {
  const get = () => select(officeSignal);
  return useSyncExternalStore(subscribeOfficeSignal, get, get);
}

const DEPLOY_FRESH_MS = 30_000;
/** Seats of snapshot v3 (`OFFICE_SEATS`; a literal so the watch chunk never imports the protocol module). */
const SEATS = 10;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isSlot = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < SEATS;

/**
 * Reads only what the beacon needs from a GET /api/office body (v3 from the watch, the v4 snapshot from the scene's
 * poller, v2 or v1 after a rollback; the fields it reads are the same in all four): up to ten desks with slots 0 to 9,
 * so an asker on the back row counts. Null when it does not look like one. Never throws and never keeps text.
 */
export function signalFromBody(body: unknown, now: number): { asking: number[]; deployAt: number | null } | null {
  if (!isObj(body) || (body.v !== 1 && body.v !== 2 && body.v !== 3 && body.v !== 4)) return null;
  if (body.enabled === false) return { asking: [], deployAt: null };
  const { desks, github } = body;
  if (body.enabled !== true || !Array.isArray(desks) || desks.length > SEATS || !Array.isArray(github)) return null;
  const asking: number[] = [];
  for (const d of desks) {
    if (!isObj(d) || typeof d.state !== "string" || !isSlot(d.slot)) return null;
    if (d.state === "input") asking.push(d.slot);
  }
  let deployAt: number | null = null;
  for (const g of github) {
    if (isObj(g) && g.kind === "deploy" && g.status === "success" && Number.isInteger(g.at) && now - (g.at as number) <= DEPLOY_FRESH_MS) deployAt = Math.max(deployAt ?? 0, g.at as number);
  }
  return { asking, deployAt };
}
