import { useSyncExternalStore } from "react";
import { createOfficePoller, OFFICE_V4_PATH, POLL, pollInterval, type OfficeFeed } from "@/lib/office/poll";
import { parseOfficeResponseV4 } from "@/lib/office/protocolV4";

/**
 * Why the scene's poller runs (design 5.9): the office in view inside `OFFICE_LOD.farDistance` ("near", OfficeScene),
 * in view past it ("far") or an office drawer open ("drawer", OfficeBody).
 */
export type OfficePollReason = "near" | "far" | "drawer";

/** The wait before the next request: the fast cadence (`pollInterval`) while near or a drawer is open, else 30 s. */
export function officePollInterval(reasons: ReadonlySet<OfficePollReason>, feed: OfficeFeed): number {
  return reasons.has("near") || reasons.has("drawer") ? pollInterval(feed) : POLL.restingMs;
}

/**
 * The 3D office's one poller (`src/lib/office/poll.ts`). It runs while any reason wants it, at the cadence the reasons
 * set (`officePollInterval`); out of view with no drawer open it stops, and the office watch polls instead. Coming
 * back into view waits out the rest of the cadence since the last request (panning across the frustum edge never
 * fetches faster than the cadence). Visitor
 * input resets its 10 minute idle stop; the tab turning visible counts as input and fetches at once. It polls snapshot
 * v4 (v3's ten seats and desk helpers plus the CI pipeline), reading a rolled-back v3, v2 or v1 body as v4 with an
 * empty pipeline; the feed keeps all ten desks (the signal reads every asker, and the scene draws all ten). Chunk only.
 */
const clock = { skew: 0 };
const wants = new Set<OfficePollReason>();
const poller = createOfficePoller({ now: () => Date.now() + clock.skew, path: OFFICE_V4_PATH, parse: parseOfficeResponseV4, interval: (feed) => officePollInterval(wants, feed) });
const INPUT = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
let detach: (() => void) | null = null;
/** Unsubscribes the test hook's one-shot listener (set while its unwanted fetch is in flight). */
let release: (() => void) | null = null;
/** Fetches that settled (any status but loading), for the test hook: a 204 keeps the feed as it was. */
let settled = 0;
poller.subscribe((feed) => {
  if (feed.status !== "loading") settled += 1;
});

function settle(): void {
  release?.();
  release = null;
}

function attach(): () => void {
  const touch = () => poller.touch();
  const onVisible = () => {
    if (document.visibilityState !== "visible" || !wants.size) return;
    poller.stop();
    poller.touch();
    poller.start({ now: true });
  };
  for (const type of INPUT) window.addEventListener(type, touch, { passive: true });
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    for (const type of INPUT) window.removeEventListener(type, touch);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export const officeLive = {
  want(reason: OfficePollReason, on: boolean): void {
    if (wants.has(reason) === on) return;
    const before = wants.size > 0;
    if (on) wants.add(reason);
    else wants.delete(reason);
    const after = wants.size > 0;
    if (after && !before) {
      settle();
      detach = attach();
      poller.start();
    } else if (!after && before) {
      poller.stop();
      detach?.();
      detach = null;
    } else if (after) poller.retime();
  },
  /** The office's view reason: "near", "far" or out of view (null); the new one joins before the old leaves, so a switch never restarts the poller. */
  view(mode: "near" | "far" | null): void {
    if (mode) officeLive.want(mode, true);
    if (mode !== "near") officeLive.want("near", false);
    if (mode !== "far") officeLive.want("far", false);
  },
  /** Whether any reason wants the poller (it may still have stopped for idleness). */
  wanted: (): boolean => wants.size > 0,
  /** The reasons wanting the poller now, sorted. */
  reasons: (): OfficePollReason[] => [...wants].sort(),
  /** Epoch ms on the poller's clock: the idle loop's quiet timer and the replay clock follow `officeTest.advance`. */
  now: (): number => Date.now() + clock.skew,
  /** The feed now, and every new one (the replay chunk's live events). */
  feed: poller.feed,
  subscribe: poller.subscribe,
};

export function useOfficeFeed(): OfficeFeed {
  return useSyncExternalStore(poller.subscribe, poller.feed, poller.feed);
}

/**
 * `__hq.office.test()` (Playwright): the feed, a fetch now, a clock skew to cross the keep-last window, the poll reasons and the settled fetch count. While
 * nothing wants the poller, poll() lets its one fetch land and stops the poller after the first settled feed.
 */
export const officeTest = {
  feed: (): OfficeFeed => poller.feed(),
  poll(): void {
    settle();
    poller.stop();
    poller.start({ now: true });
    if (wants.size) return;
    release = poller.subscribe((feed) => {
      if (feed.status === "loading") return;
      settle();
      if (!wants.size) poller.stop();
    });
  },
  advance(ms: number): void {
    clock.skew += ms;
    officeTest.poll();
  },
  wanted: (): boolean => wants.size > 0,
  reasons: (): OfficePollReason[] => officeLive.reasons(),
  settled: (): number => settled,
};
