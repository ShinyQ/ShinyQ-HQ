import { isBotLike } from "../boot-first";
import { isStatsOptedOut, STATS_OPTOUT_EVENT } from "./optout";
import { VISIT_ENDPOINT, VISIT_VERSION, type VisitMode } from "./visit";

/**
 * First-party visit beacon (public visit stats): one point per page lifetime saying whether the
 * visitor used the 3D view, the Classic site or both. De-duplicated in memory only (no storage, no
 * cookie, no identifier). Never sent under Do Not Track, Global Privacy Control, the "Don't count my
 * visits" opt-out, automation or a crawler (`?visit=1` forces it in tests and previews, `?visit=0`
 * turns it off). The Classic site counts only after it stayed on screen for CLASSIC_DWELL_MS, so the
 * moment between a released boot cover and the 3D tower mounting never reads as a Classic visit.
 */

/** How long the Classic site must stay on screen (visible, no boot cover, no tower) to count. */
export const CLASSIC_DWELL_MS = 3000;

export interface VisitSignals {
  /** Do Not Track or Global Privacy Control. */
  privacySignal: boolean;
  /** navigator.webdriver: Playwright, Lighthouse and other automation. */
  webdriver: boolean;
  /** Crawler, preview or audit user agent. */
  crawler: boolean;
  search: string;
  optedOut: boolean;
}

export function visitAllowed(s: VisitSignals): boolean {
  if (s.privacySignal || s.optedOut) return false;
  const forced = /[?&]visit=([01])(&|$)/.exec(s.search)?.[1];
  if (forced) return forced === "1";
  return !s.webdriver && !s.crawler;
}

export function visitMode(seen: { threeD: boolean; classic: boolean }): VisitMode | null {
  if (seen.threeD && seen.classic) return "both";
  if (seen.threeD) return "3d";
  return seen.classic ? "classic" : null;
}

/** The view on screen now: the 3D tower (`html[data-hq]`), the Classic site (no boot cover, page visible), or neither. */
export function viewOf(html: Pick<Element, "hasAttribute">, visible: boolean): "3d" | "classic" | null {
  if (html.hasAttribute("data-hq")) return "3d";
  if (html.hasAttribute("data-hq-boot")) return null;
  return visible ? "classic" : null;
}

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

function signals(): VisitSignals {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  const search = window.location.search;
  return {
    privacySignal: nav.doNotTrack === "1" || nav.globalPrivacyControl === true,
    webdriver: nav.webdriver === true,
    crawler: isBotLike({ userAgent: nav.userAgent, webdriver: false }, search),
    search,
    optedOut: isStatsOptedOut(storage()),
  };
}

let active = false;

/** Tests only: forget the page lifetime's beacon. */
export function resetVisitBeacon(): void {
  active = false;
}

/** Starts watching once per page lifetime; returns a cleanup (which allows a restart only if nothing was sent). */
export function startVisitBeacon(now: () => number = () => performance.now()): () => void {
  if (active || typeof window === "undefined") return () => {};
  if (!visitAllowed(signals())) return () => {};
  active = true;
  const doc = document;
  const html = doc.documentElement;
  const seen = { threeD: false, classic: false };
  let classicSince: number | null = null;
  let done = false;

  const look = () => {
    const view = viewOf(html, doc.visibilityState === "visible");
    const t = now();
    if (classicSince !== null && t - classicSince >= CLASSIC_DWELL_MS) seen.classic = true;
    if (view === "3d") seen.threeD = true;
    if (view === "classic") classicSince ??= t;
    else classicSince = null;
  };
  const observer = new MutationObserver(look);

  const stop = () => {
    observer.disconnect();
    doc.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", send);
    window.removeEventListener(STATS_OPTOUT_EVENT, onOptOut);
  };
  function send() {
    if (done) return;
    if (classicSince !== null && now() - classicSince >= CLASSIC_DWELL_MS) seen.classic = true;
    const mode = visitMode(seen);
    if (!mode) return;
    done = true;
    stop();
    if (isStatsOptedOut(storage())) return;
    try {
      navigator.sendBeacon?.(VISIT_ENDPOINT, JSON.stringify({ v: VISIT_VERSION, mode }));
    } catch {
      // A refused beacon is a lost count, never an error for the visitor.
    }
  }
  function onVisibility() {
    // Credits the Classic dwell up to this moment; a hidden page then stops the clock.
    look();
    if (doc.visibilityState === "hidden") send();
  }
  function onOptOut() {
    if (!isStatsOptedOut(storage())) return;
    done = true;
    stop();
  }

  look();
  observer.observe(html, { attributes: true, attributeFilter: ["data-hq", "data-hq-boot"] });
  doc.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", send);
  window.addEventListener(STATS_OPTOUT_EVENT, onOptOut);
  return () => {
    stop();
    if (!done) active = false;
  };
}
