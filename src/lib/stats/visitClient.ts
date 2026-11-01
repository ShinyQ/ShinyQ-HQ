import { isBotLike } from "../boot-first";
import { VISIT_ENDPOINT, VISIT_KIND, VISIT_VERSION, visitSource, type VisitIntent, type VisitMode } from "./visit";

/**
 * First-party visit beacon (public visit stats). Two pings, nothing identifying in either (no cookie, no
 * identifier, no URL):
 * - the visit ping, the public visit count (owner decision 2026-10-24): sent as soon as the page is shown,
 *   once per browser tab session (a `sessionStorage` flag, so a reload or an in-tab navigation never counts
 *   twice; memory only when storage is blocked);
 * - the mode ping, once per page lifetime on the first hide or `pagehide`: whether the visitor used the 3D
 *   view, the Classic site or both. The Classic site counts only after it stayed on screen for
 *   CLASSIC_DWELL_MS, so the moment between a released boot cover and the 3D tower never reads as Classic;
 * - the intent ping (private, owner decision 2026-11-01), once per tab session and kind: a CV open
 *   (`countIntent("cv")` from DialogHost, so every entry point counts), or a click on an email, copy email,
 *   LinkedIn or GitHub link (`intentOf`). The visit ping also carries the landing's allowlisted `?src=` tag.
 * Do Not Track and Global Privacy Control visitors are counted (owner decision 2026-10-24: nothing
 * identifying is sent). Automation and crawlers never send (`?visit=1` forces both pings in tests and
 * previews, `?visit=0` turns them off).
 */

/** How long the Classic site must stay on screen (visible, no boot cover, no tower) to count. */
export const CLASSIC_DWELL_MS = 3000;
/** sessionStorage flag of the visit ping: set once the tab session's visit was sent. */
export const VISIT_SESSION_KEY = "hq:visit";
/** sessionStorage flag prefix of the intent pings: `hq:intent:cv` once the tab session's CV open was sent. */
export const INTENT_SESSION_PREFIX = "hq:intent:";

export interface VisitSignals {
  /** navigator.webdriver: Playwright, Lighthouse and other automation. */
  webdriver: boolean;
  /** Crawler, preview or audit user agent. */
  crawler: boolean;
  search: string;
}

export function visitAllowed(s: VisitSignals): boolean {
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

/** The retired "Don't count my visits" key (owner decision 2026-10-23: the opt-out is gone). */
export const LEGACY_OPTOUT_KEY = "hq:stats-optout";

/** Removes a stale opt-out key, so a visitor who once opted out is counted again. Storage errors are ignored. */
export function clearLegacyOptOut(): void {
  try {
    window.localStorage.removeItem(LEGACY_OPTOUT_KEY);
  } catch {
    // Storage blocked: nothing stored to clear.
  }
}

function signals(): VisitSignals {
  const nav = navigator;
  const search = window.location.search;
  return {
    webdriver: nav.webdriver === true,
    crawler: isBotLike({ userAgent: nav.userAgent, webdriver: false }, search),
    search,
  };
}

/** Memory fallback of the tab session flags when sessionStorage is blocked. */
const sentInMemory = new Set<string>();

function sent(key: string): boolean {
  if (sentInMemory.has(key)) return true;
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSent(key: string): void {
  sentInMemory.add(key);
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Storage blocked: the memory flag covers this page lifetime.
  }
}

/** The intent a click on `target` shows, if any: a `data-hq-intent` control (copy email), or a link to the email, LinkedIn or GitHub. */
export function intentOf(target: Element | null): VisitIntent | null {
  const el = target?.closest?.("a, button");
  if (!el) return null;
  const tagged = el.getAttribute("data-hq-intent");
  if (tagged === "email" || tagged === "cv") return tagged;
  const href = el.getAttribute("href") ?? "";
  if (href.startsWith("mailto:")) return "email";
  if (/^https:\/\/(www\.)?linkedin\.com\//.test(href)) return "linkedin";
  if (/^https:\/\/github\.com\//.test(href)) return "github";
  return null;
}

/** Sends one intent ping per tab session and kind, only where visits are counted (never automation or crawlers). */
export function countIntent(intent: VisitIntent): void {
  if (typeof window === "undefined" || !visitAllowed(signals())) return;
  const key = INTENT_SESSION_PREFIX + intent;
  if (sent(key)) return;
  if (beacon({ v: VISIT_VERSION, intent })) markSent(key);
}

function beacon(body: object): boolean {
  try {
    return navigator.sendBeacon?.(VISIT_ENDPOINT, JSON.stringify(body)) === true;
  } catch {
    // A refused beacon is a lost count, never an error for the visitor.
    return false;
  }
}

let active = false;

/** Tests only: forget the page lifetime's beacon and the memory flags. */
export function resetVisitBeacon(): void {
  active = false;
  sentInMemory.clear();
}

/** Starts watching once per page lifetime; returns a cleanup (which allows a restart only if no mode ping was sent). */
export function startVisitBeacon(now: () => number = () => performance.now()): () => void {
  if (active || typeof window === "undefined") return () => {};
  clearLegacyOptOut();
  if (!visitAllowed(signals())) return () => {};
  active = true;
  const doc = document as Document & { prerendering?: boolean };
  const html = doc.documentElement;
  const seen = { threeD: false, classic: false };
  let classicSince: number | null = null;
  let done = false;

  const shown = () => doc.visibilityState === "visible" && doc.prerendering !== true;
  const src = visitSource(window.location.search);
  const ping = () => {
    if (!shown() || sent(VISIT_SESSION_KEY)) return;
    if (beacon({ v: VISIT_VERSION, kind: VISIT_KIND, ...(src ? { src } : {}) })) markSent(VISIT_SESSION_KEY);
  };
  // Intent clicks count for the whole page lifetime, also after the mode ping went out on a first hide.
  const onClick = (event: MouseEvent) => {
    const intent = intentOf(event.target as Element | null);
    if (intent) countIntent(intent);
  };

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
    doc.removeEventListener("prerenderingchange", ping);
    window.removeEventListener("pagehide", send);
  };
  function send() {
    if (done) return;
    if (classicSince !== null && now() - classicSince >= CLASSIC_DWELL_MS) seen.classic = true;
    const mode = visitMode(seen);
    if (!mode) return;
    done = true;
    stop();
    beacon({ v: VISIT_VERSION, mode });
  }
  function onVisibility() {
    ping();
    // Credits the Classic dwell up to this moment; a hidden page then stops the clock.
    look();
    if (doc.visibilityState === "hidden") send();
  }

  ping();
  look();
  observer.observe(html, { attributes: true, attributeFilter: ["data-hq", "data-hq-boot"] });
  doc.addEventListener("visibilitychange", onVisibility);
  doc.addEventListener("prerenderingchange", ping);
  doc.addEventListener("click", onClick, true);
  window.addEventListener("pagehide", send);
  return () => {
    stop();
    doc.removeEventListener("click", onClick, true);
    if (!done) active = false;
  };
}
