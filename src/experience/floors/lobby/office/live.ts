import { useSyncExternalStore } from "react";
import { createOfficePoller, type OfficeFeed } from "@/lib/office/poll";

/**
 * The 3D office's one poller (`src/lib/office/poll.ts`). It runs while any reason wants it: the office in view on
 * L1 ("view", OfficeScene) or an office drawer open ("drawer", OfficeBody). Visitor input resets its 10 minute
 * idle stop; the tab turning visible counts as input and fetches at once. Chunk only.
 */
const clock = { skew: 0 };
const poller = createOfficePoller({ now: () => Date.now() + clock.skew });
const wants = new Set<string>();
const INPUT = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
let detach: (() => void) | null = null;

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
      detach = attach();
      poller.start();
    } else if (!after && before) {
      poller.stop();
      detach?.();
      detach = null;
    }
  },
  polling: (): boolean => wants.size > 0,
};

const subscribe = (onChange: () => void) => poller.subscribe(onChange);

export function useOfficeFeed(): OfficeFeed {
  return useSyncExternalStore(subscribe, poller.feed, poller.feed);
}

/** `__hq.office.test()` (Playwright): the feed, a fetch now, and a clock skew to cross the keep-last window. */
export const officeTest = {
  feed: (): OfficeFeed => poller.feed(),
  poll(): void {
    poller.stop();
    poller.start();
    if (!wants.size) poller.stop();
  },
  advance(ms: number): void {
    clock.skew += ms;
    officeTest.poll();
  },
  polling: (): boolean => wants.size > 0,
};
