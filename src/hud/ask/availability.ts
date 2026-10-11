"use client";

import { useSyncExternalStore } from "react";
import { fetchAskStatus } from "@/ask/client";
import type { AskStatus } from "@/ask/protocol";
import { drawerLayout, type DrawerLayout } from "@/hud/drawer/layout";

/**
 * Shared Ask the HQ availability for the dock, the hero bar and the 3D pill. `GET /api/ask` runs
 * once per page load, on idle a moment after `load` (never on first paint) or at once when an entry
 * point is used; every subscriber re-renders when it resolves.
 */

const IDLE_DELAY_MS = 1500;
const listeners = new Set<() => void>();
let scheduled = false;
let current: AskStatus | null | undefined;

const notify = () => listeners.forEach((listener) => listener());

/** Fetches the status now (cached per page load) and notifies subscribers. */
export function requestAskStatus(): Promise<AskStatus | null> {
  return fetchAskStatus().then((status) => {
    current = status;
    notify();
    return status;
  });
}

/** Fetches the status once the page is idle after `load`. */
export function scheduleAskStatus(delayMs = IDLE_DELAY_MS) {
  if (scheduled || typeof window === "undefined") return;
  scheduled = true;
  const run = () => void requestAskStatus();
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

/** The dock reports whether its chat panel is open, so the 3D Walk HUD can step aside (left of the side panel). */
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
