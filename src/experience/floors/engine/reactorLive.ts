import { useSyncExternalStore } from "react";
import { createOfficePoller, OFFICE_V4_PATH, pollInterval, type OfficeFeed, type OfficePollerOptions } from "@/lib/office/poll";
import { parseOfficeResponseV4 } from "@/lib/office/protocolV4";
import { requestStats } from "@/lib/visits/store";

/** The listener side of `window` and `document` (tests hand in fakes). */
type Listeners = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export interface ReactorLiveOptions extends Pick<OfficePollerOptions, "fetcher" | "now" | "visible" | "setTimer" | "clearTimer"> {
  /** Starts the page's one stats fetch (default: the stats store's `requestStats`, which dedupes). */
  requestStats?: () => unknown;
  /** Where input events land (default `window`). */
  win?: Listeners;
  /** Where `visibilitychange` lands and its `visibilityState` (default `document`). */
  doc?: Listeners & { visibilityState: DocumentVisibilityState };
}

const INPUT = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * B1's reactor feed: snapshot v4 of the Agent Office (`/api/office?v=4`, `pollInterval` cadence) polled only while the
 * visitor is on B1 (`start` on arrival, `stop` on leaving), plus the page's one stats fetch on the first start. Visitor
 * input resets the poller's 10 minute idle stop (and restarts it after one); the tab turning visible counts as input
 * and fetches at once. Listeners attach on `start` and detach on `stop`. B1 chunk only: nothing on the main 3D path
 * imports this module.
 */
export function createReactorLive(opts: ReactorLiveOptions = {}) {
  const clock = { skew: 0 };
  const base = opts.now ?? (() => Date.now());
  const now = () => base() + clock.skew;
  const poller = createOfficePoller({
    now,
    path: OFFICE_V4_PATH,
    parse: parseOfficeResponseV4,
    interval: pollInterval,
    fetcher: opts.fetcher,
    visible: opts.visible,
    setTimer: opts.setTimer,
    clearTimer: opts.clearTimer,
  });
  const askStats = opts.requestStats ?? (() => void requestStats());
  let started = false;
  let statsAsked = false;
  let detach: (() => void) | null = null;
  /** Unsubscribes the test hook's one-shot listener (set while its fetch, made while stopped, is in flight). */
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
    const win = opts.win ?? window;
    const doc = opts.doc ?? document;
    const touch = () => poller.touch();
    const onVisible = () => {
      if (doc.visibilityState !== "visible" || !started) return;
      poller.stop();
      poller.touch();
      poller.start({ now: true });
    };
    for (const type of INPUT) win.addEventListener(type, touch, { passive: true });
    doc.addEventListener("visibilitychange", onVisible);
    return () => {
      for (const type of INPUT) win.removeEventListener(type, touch);
      doc.removeEventListener("visibilitychange", onVisible);
    };
  }

  const live = {
    /** The visitor reached B1: listen, poll, and ask the stats once per page load. Idempotent. */
    start(): void {
      if (started) return;
      started = true;
      settle();
      detach = attach();
      poller.start();
      if (!statsAsked) {
        statsAsked = true;
        askStats();
      }
    },
    /** The visitor left B1: stop the poller (aborts the request in flight, keeps the last feed) and detach. */
    stop(): void {
      settle();
      poller.stop();
      if (!started) return;
      started = false;
      detach?.();
      detach = null;
    },
    started: (): boolean => started,
    /** Epoch ms on the poller's clock (follows `test.advance`). */
    now,
    feed: poller.feed,
    subscribe: poller.subscribe,
    /**
     * `__hq` test hook (Playwright), mirroring `officeTest`: the feed, a fetch now, a clock skew to cross the
     * keep-last and stale windows, whether B1 started the poller and the settled fetch count. While stopped, poll()
     * lets its one fetch land and stops the poller after the first settled feed.
     */
    test: {
      feed: (): OfficeFeed => poller.feed(),
      poll(): void {
        settle();
        poller.stop();
        poller.start({ now: true });
        if (started) return;
        release = poller.subscribe((feed) => {
          if (feed.status === "loading") return;
          settle();
          if (!started) poller.stop();
        });
      },
      advance(ms: number): void {
        clock.skew += ms;
        live.test.poll();
      },
      started: (): boolean => started,
      settled: (): number => settled,
    },
  };
  return live;
}

/** The app's reactor poller (EngineRoom starts it on B1 and stops it on leaving). */
export const reactorLive = createReactorLive();

/** `__hq` test hook for the reactor feed (wired where the B1 scene mounts). */
export const reactorTest = reactorLive.test;

export function useReactorFeed(): OfficeFeed {
  return useSyncExternalStore(reactorLive.subscribe, reactorLive.feed, reactorLive.feed);
}
