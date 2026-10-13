import type { RumPath } from "@/lib/rum/protocol";

/** Share of 3D sessions that send the performance beacon (appendix 06 section 4). */
export const RUM_RATE = 0.25;
/** sessionStorage: "on" or "off" once decided for this browser session, "sent" after the beacon left. */
export const RUM_SESSION_KEY = "hq:rum";

export interface RumDecisionInput {
  stored: string | null;
  search: string;
  /** navigator.webdriver: Playwright, Lighthouse and other automation. */
  webdriver: boolean;
  /** Do Not Track or Global Privacy Control. */
  privacySignal: boolean;
  /** Math.random() for this session. */
  random: number;
}

export type RumDecision = "on" | "off" | "sent";

/**
 * Once per browser session: never again after the beacon was sent; `?rum=1` forces it on (preview
 * checks, tests) and `?rum=0` off; then the stored decision; automation and privacy signals are off;
 * otherwise RUM_RATE of sessions.
 */
export function rumDecision(i: RumDecisionInput): RumDecision {
  if (i.stored === "sent") return "sent";
  const forced = /[?&]rum=([01])(&|$)/.exec(i.search)?.[1];
  if (forced === "1") return "on";
  if (forced === "0") return "off";
  if (i.stored === "on" || i.stored === "off") return i.stored;
  if (i.webdriver || i.privacySignal) return "off";
  return i.random < RUM_RATE ? "on" : "off";
}

/** Coarse load path: a floor or room route, the game-first boot cover, or Enter the 3D HQ from the Page View. */
export function rumPath({ startFloor, startRoom, coverUsed }: { startFloor?: string; startRoom?: string; coverUsed: boolean }): RumPath {
  if (startFloor || startRoom) return "deeplink";
  return coverUsed ? "cover" : "enter";
}

/** Reads and stores this session's decision; true when this 3D view should run the RUM probe. */
export function decideRum(): boolean {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(RUM_SESSION_KEY);
  } catch {
    // Storage blocked: decide for this page only.
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  const decision = rumDecision({
    stored,
    search: window.location.search,
    webdriver: nav.webdriver === true,
    privacySignal: nav.doNotTrack === "1" || nav.globalPrivacyControl === true,
    random: Math.random(),
  });
  if (decision !== "sent") {
    try {
      sessionStorage.setItem(RUM_SESSION_KEY, decision);
    } catch {
      // Same as above.
    }
  }
  return decision === "on";
}
