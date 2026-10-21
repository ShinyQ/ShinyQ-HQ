import { useSyncExternalStore } from "react";
import { createOfficePoller, OFFICE_V2_PATH, type OfficeFeed } from "@/lib/office/poll";
import { parseOfficeResponseV2 } from "@/lib/office/protocol";

/**
 * The 3D office's one poller (`src/lib/office/poll.ts`). It runs while any reason wants it: the office in view on
 * L1 ("view", OfficeScene) or an office drawer open ("drawer", OfficeBody). Visitor input resets its 10 minute
 * idle stop; the tab turning visible counts as input and fetches at once. It polls snapshot v2 (desk helpers), which
 * also accepts a v1 body after a rollback. Chunk only.
 */
const clock = { skew: 0 };
const poller = createOfficePoller({ now: () => Date.now() + clock.skew, path: OFFICE_V2_PATH, parse: parseOfficeResponseV2 });
const wants = new Set<string>();
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
    poller.start();
  };
  for (const type of INPUT) window.addEventListener(type, touch, { passive: true });
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    for (const type of INPUT) window.removeEventListener(type, touch);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export const officeLive = {
  want(reason: string, on: boolean): void {
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
    }
  },
  /** Whether any reason wants the poller (it may still have stopped for idleness). */
  wanted: (): boolean => wants.size > 0,
};

const subscribe = (onChange: () => void) => poller.subscribe(onChange);

export function useOfficeFeed(): OfficeFeed {
  return useSyncExternalStore(subscribe, poller.feed, poller.feed);
}

/**
 * `__hq.office.test()` (Playwright): the feed, a fetch now, a clock skew to cross the keep-last window and the settled fetch count. While
 * nothing wants the poller, poll() lets its one fetch land and stops the poller after the first settled feed.
 */
export const officeTest = {
  feed: (): OfficeFeed => poller.feed(),
  poll(): void {
    settle();
    poller.stop();
    poller.start();
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
  settled: (): number => settled,
};
