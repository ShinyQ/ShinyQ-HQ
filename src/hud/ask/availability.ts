"use client";

import { useSyncExternalStore } from "react";
import { fetchAskStatus, isAskEnabled } from "@/ask/status";
import type { AskStatus } from "@/ask/protocol";
import { drawerLayout, type DrawerLayout } from "@/hud/drawer/layout";

/**
 * Shared Ask the HQ availability for the dock, the hero bar and the 3D pill.
 *
 * `GET /api/ask` runs when the Ask dock opens (`requestAskStatus`, once per page load). The surfaces whose
 * visibility depends on the status (the floating launcher and its teaser, the hero bar, the 3D pill) also
 * need it without an open: the dock checks on idle a moment after `load` (never on first paint) through
 * `ensureAskStatus`, which reuses an "enabled" answer from earlier in the tab session
 * (`sessionStorage["hq:ask-status"]`, `ASK_STATUS_TTL_MS`) instead of asking again on every page view. The
 * palette and the Rover menu use the same check. Every subscriber re-renders when the status arrives.
 */

const IDLE_DELAY_MS = 1500;
export const ASK_STATUS_CACHE_KEY = "hq:ask-status";
/** How long an "enabled" status from this tab session stands in for the idle check (a fresh one runs on open). */
export const ASK_STATUS_TTL_MS = 10 * 60 * 1000;
const listeners = new Set<() => void>();
let scheduled = false;
let current: AskStatus | null | undefined;

const notify = () => listeners.forEach((listener) => listener());

function readCached(): AskStatus | null {
  try {
    const raw = sessionStorage.getItem(ASK_STATUS_CACHE_KEY);
    if (!raw) return null;
    const { at, status } = JSON.parse(raw) as { at?: unknown; status?: AskStatus };
    const age = Date.now() - Number(at);
    return age >= 0 && age < ASK_STATUS_TTL_MS && isAskEnabled(status) ? status : null;
  } catch {
    return null;
  }
}

function writeCached(status: AskStatus | null) {
  try {
    if (isAskEnabled(status)) sessionStorage.setItem(ASK_STATUS_CACHE_KEY, JSON.stringify({ at: Date.now(), status }));
    else sessionStorage.removeItem(ASK_STATUS_CACHE_KEY);
  } catch {
    // Without storage the next page view checks again.
  }
}

/** Fetches the status now (cached per page load), remembers an enabled one for the session and notifies subscribers. */
export function requestAskStatus(): Promise<AskStatus | null> {
  return fetchAskStatus().then((status) => {
    current = status;
    writeCached(status);
    notify();
    return status;
  });
}

/** The status for rendering: the one known on this page, else a fresh "enabled" from this tab session, else a fetch. */
export function ensureAskStatus(): Promise<AskStatus | null> {
  if (current !== undefined) return Promise.resolve(current);
  const cached = typeof window === "undefined" ? null : readCached();
  if (cached) {
    current = cached;
    notify();
    return Promise.resolve(cached);
  }
  return requestAskStatus();
}

/** Checks the status once the page is idle after `load` (see `ensureAskStatus`). */
export function scheduleAskStatus(delayMs = IDLE_DELAY_MS) {
  if (scheduled || typeof window === "undefined") return;
  scheduled = true;
  const run = () => void ensureAskStatus();
  const idle = () => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 3000 });
    else run();
  };
  const later = () => window.setTimeout(idle, delayMs);
  if (document.readyState === "complete") later();
  else window.addEventListener("load", later, { once: true });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `undefined` while unknown, `null` when unavailable (404, 503, network), else the status. */
export function useAskStatus(): AskStatus | null | undefined {
  return useSyncExternalStore(subscribe, () => current, () => undefined);
}

/* ------------------------------------------------------------ environment */

let heroVisible = false;
const heroListeners = new Set<() => void>();

/** The home hero ask bar reports whether it is on screen; the floating launcher steps aside meanwhile. */
export function setHeroVisible(visible: boolean) {
  if (heroVisible === visible) return;
  heroVisible = visible;
  heroListeners.forEach((listener) => listener());
}

export function useHeroVisible(): boolean {
  return useSyncExternalStore(
    (listener) => {
      heroListeners.add(listener);
      return () => {
        heroListeners.delete(listener);
      };
    },
    () => heroVisible,
    () => false,
  );
}

let panelOpen = false;
const panelListeners = new Set<() => void>();

/** The dock reports whether its chat panel is open: the room drawer narrows behind it, and Rover's dialog box and the hint bubbles step aside. */
export function setAskPanelOpen(open: boolean) {
  if (panelOpen === open) return;
  panelOpen = open;
  panelListeners.forEach((listener) => listener());
}

export function useAskPanelOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      panelListeners.add(listener);
      return () => {
        panelListeners.delete(listener);
      };
    },
    () => panelOpen,
    () => false,
  );
}

function subscribeTower(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-hq"] });
  return () => observer.disconnect();
}

/** True while the 3D tower is open over the page (`html[data-hq]`, set by Experience). */
export function useTowerOpen(): boolean {
  return useSyncExternalStore(
    subscribeTower,
    () => document.documentElement.hasAttribute("data-hq"),
    () => false,
  );
}

function subscribeResize(listener: () => void) {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

/** Side panel on desktop and landscape tablets, bottom sheet on phones and portrait tablets (same rule as the Glass Drawer). */
export function useDockLayout(): DrawerLayout {
  return useSyncExternalStore(
    subscribeResize,
    () => drawerLayout(window.innerWidth, window.innerHeight),
    () => "sheet",
  );
}

/** Test hook. */
export function resetAskAvailability() {
  scheduled = false;
  current = undefined;
  heroVisible = false;
  panelOpen = false;
  listeners.clear();
}
