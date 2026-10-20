import { useSyncExternalStore } from "react";

/**
 * Main-path Agent Office signal (design 2026-10-20 section 5.3): whether a Rover needs Kurniadi (the beacon and the
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

const blank = (): OfficeSignal => ({ needsKurniadi: false, asking: [], deployAt: null, sceneFeeding: false, goodAt: 0 });
export const officeSignal: OfficeSignal = blank();
const SERVER = blank();
const listeners = new Set<() => void>();

export function setOfficeSignal(patch: Partial<OfficeSignal>): void {
  Object.assign(officeSignal, patch);
  officeSignal.needsKurniadi = officeSignal.asking.length > 0;
  for (const l of listeners) l();
}

export const subscribeOfficeSignal = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** `select` must return a primitive or a field of the signal (a fresh object each call would re-render forever). */
export function useOfficeSignal<T>(select: (s: OfficeSignal) => T): T {
  return useSyncExternalStore(
    subscribeOfficeSignal,
    () => select(officeSignal),
    () => select(SERVER),
  );
}

const DEPLOY_FRESH_MS = 30_000;
const DESKS = 5;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isSlot = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < DESKS;

/**
 * Reads only what the beacon needs from a GET /api/office (v1) body: null when it does not look like one. Never throws
 * and never keeps text. An office in mode "off" asks nothing (its Rovers sleep, as in the scene's view).
 */
export function signalFromBody(body: unknown, now: number): { asking: number[]; deployAt: number | null } | null {
  if (!isObj(body) || body.v !== 1) return null;
  if (body.enabled === false) return { asking: [], deployAt: null };
  const { desks, github } = body;
  if (body.enabled !== true || !Array.isArray(desks) || desks.length > DESKS || !Array.isArray(github)) return null;
  const asking: number[] = [];
  for (const d of desks) {
    if (!isObj(d) || typeof d.state !== "string" || !isSlot(d.slot)) return null;
    if (d.state === "input" && body.mode !== "off") asking.push(d.slot);
  }
  let deployAt: number | null = null;
  for (const g of github) {
    if (isObj(g) && g.kind === "deploy" && g.status === "success" && Number.isInteger(g.at) && now - (g.at as number) <= DEPLOY_FRESH_MS) deployAt = Math.max(deployAt ?? 0, g.at as number);
  }
  return { asking, deployAt };
}
