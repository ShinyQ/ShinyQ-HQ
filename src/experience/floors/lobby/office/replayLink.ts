import { useMemo, useSyncExternalStore } from "react";
import type { OfficeFeed, OfficeFeedSnapshot, OfficeFeedStatus } from "@/lib/office/poll";
import { officeLive, useOfficeFeed } from "./live";
import { officeView, type OfficeView } from "./officeModel";
import type { ReplayController, ReplayState, ReplayStatus } from "./replayFeed";

/**
 * The scene chunk's side of the day replay (design 7.3): the store the replay chunk publishes to, the scene's source
 * switch, the idle loop, the labels and the one loader of the replay chunk (live events are the chunk's: `linkReplay`). Values never come from the replay
 * chunk here (types only), so the engine, the feed and the history validators stay in their own chunk. The replay chunk
 * imports this module, so nothing here may import three (the probes do): a three import from the replay chunk splits three
 * out of the main 3D chunk, about 550 B more on the first frame (tests/unit/office-chunk-graph.test.ts). The scene writes
 * `sceneProbes.office.replay` through `subscribeReplay`.
 */
export const REPLAY_OFF: ReplayState = { status: "off", day: null, days: [], playS: 0, duration: 0, dayS: 0, auto: false, truncated: false, empty: false, seq: 0 };

/** Shared with the replay chunk: its state and snapshot, its controller once loaded, whether the 3D scene is mounted, and the idle bookkeeping (epoch ms on `officeLive.now`). */
export const officeReplay: { state: ReplayState; snapshot: OfficeFeedSnapshot | null; controller: ReplayController | null; mounted: boolean; quietSince: number; failedAt: number } = {
  state: REPLAY_OFF,
  snapshot: null,
  controller: null,
  mounted: false,
  quietSince: 0,
  failedAt: -Infinity,
};

/** `REPLAY.idleS` and `REPLAY.retryS` of ./replay.ts in ms (that module is replay chunk only; a test pins them equal). */
const IDLE_MS = 30_000;
const RETRY_MS = 300_000;

const listeners = new Set<() => void>();
let current = { state: REPLAY_OFF, snapshot: null as OfficeFeedSnapshot | null, mounted: false };

/** Sets the replay's state and snapshot (or only notifies, for `mounted`); a replay that ends restarts the quiet timer, so the idle loop waits again. */
export function publishReplay(state: ReplayState, snapshot: OfficeFeedSnapshot | null): void {
  if (state.status === "off" && officeReplay.state.status !== "off") officeReplay.quietSince = officeLive.now();
  officeReplay.state = state;
  officeReplay.snapshot = snapshot;
  current = { state, snapshot, mounted: officeReplay.mounted };
  for (const l of listeners) l();
}

/** Calls `cb` after every publish (React's stores below, and the scene's probe). */
export const subscribeReplay = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useReplay(): { state: ReplayState; snapshot: OfficeFeedSnapshot | null; mounted: boolean } {
  return useSyncExternalStore(subscribeReplay, () => current, () => current);
}

const snap = () => officeReplay.snapshot;
const seqOf = () => officeReplay.state.seq;

/** The scene's view: the replay's while one plays, else the live feed's; `live` is always the live view (signal, targets). */
export function useOfficeSource(): { view: OfficeView; live: OfficeView; feed: OfficeFeed } {
  const feed = useOfficeFeed();
  // The snapshot and `seq` only: a publish that moved only the day time re-renders nothing here.
  const snapshot = useSyncExternalStore(subscribeReplay, snap, snap);
  const seq = useSyncExternalStore(subscribeReplay, seqOf, seqOf);
  const live = useMemo(() => officeView(feed), [feed]);
  const view = useMemo(() => {
    const { day, truncated } = officeReplay.state;
    return snapshot && day ? officeView({ status: "ready", snapshot }, { day, seq, truncated }) : live;
  }, [snapshot, seq, live]);
  return { view, live, feed };
}

/**
 * The idle loop's rule: a feed past its first answer and not disabled (offline counts: a cached day may play),
 * `REPLAY.idleS` quiet (`idleLoop` restarts the timer on an awake desk or the office out of view), motion on, no
 * replay running (off, or unavailable before) and `REPLAY.retryS` since a failed or empty attempt.
 */
export function idleLoopWanted(i: { feed: OfficeFeedStatus; quietMs: number; reduced: boolean; status: ReplayStatus; sinceFailMs: number }): boolean {
  return (i.feed === "ready" || i.feed === "offline") && i.quietMs >= IDLE_MS && !i.reduced && (i.status === "off" || i.status === "unavailable") && i.sinceFailMs >= RETRY_MS;
}

/**
 * The idle loop (every 0.5 s with the scene's watch): an awake live desk or the office out of view restarts the quiet
 * timer; a quiet office (`idleLoopWanted`) loads the replay chunk and calls its `auto()`, which checks again, ends on a
 * live event and records a failure itself (`linkReplay`). A failed import waits `REPLAY.retryS` too.
 */
export function idleLoop(awake: boolean, feed: OfficeFeedStatus, inView: boolean, reduced: boolean): void {
  const r = officeReplay;
  const now = officeLive.now();
  if (awake || !inView) r.quietSince = now;
  if (idleLoopWanted({ feed, quietMs: now - r.quietSince, reduced, status: r.state.status, sinceFailMs: now - r.failedAt }))
    void loadOfficeReplay().then(
      (m) => m.replayController.auto(),
      () => {
        r.failedAt = officeLive.now();
      },
    );
}

let pending: Promise<typeof import("./replayChunk")> | null = null;

/** The replay chunk, once per page; a failed import is forgotten so the drawer's control can retry. This import() is the only reference to it. */
export function loadOfficeReplay(): Promise<typeof import("./replayChunk")> {
  pending ??= import("./replayChunk").catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

/** "Mon 19 Oct" / "Sen 19 Okt". */
export function replayDayLabel(day: string, locale: "en" | "id"): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .formatToParts(Date.UTC(y, m - 1, d))
    .filter((p) => p.type !== "literal")
    .map((p) => p.value)
    .join(" ");
}

const two = (n: number) => String(n).padStart(2, "0");
/** Day seconds as "14:05". */
export const replayClock = (dayS: number): string => `${two(Math.floor(dayS / 3600) % 24)}:${two(Math.floor(dayS / 60) % 60)}`;
