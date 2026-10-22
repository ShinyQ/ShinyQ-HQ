import { useMemo, useSyncExternalStore } from "react";
import type { OfficeFeed, OfficeFeedSnapshot, OfficeFeedStatus } from "@/lib/office/poll";
import { officeLive, useOfficeFeed } from "./live";
import { officeView, type OfficeView } from "./officeModel";
import type { ReplayController, ReplayState } from "./replayFeed";
import type { ReplayUi } from "./ReplayPill";

/**
 * The scene chunk's side of the day replay (design 7.3): the store the replay chunk publishes to, the scene's source
 * switch, the idle loop, the one loader of the replay chunk (live events are the chunk's: `linkReplay`). Values never come from the replay
 * chunk here (types only), so the engine, the feed and the history validators stay in their own chunk. The replay chunk
 * imports this module, so nothing here may import three (the probes do): a three import from the replay chunk splits three
 * out of the main 3D chunk, about 550 B more on the first frame (tests/unit/office-chunk-graph.test.ts). The scene writes
 * `sceneProbes.office.replay` through `subscribeReplay`.
 */
/** The replay off. Only the field the scene reads before the replay chunk is here (`status`); the chunk replaces it with the whole state (`REPLAY_STATE_OFF` in ./replayFeed.ts) when it loads. */
export const REPLAY_OFF = { status: "off" } as ReplayState;

/** Shared with the replay chunk: its state and snapshot, its controller once loaded, whether the 3D scene is mounted, and the idle bookkeeping (epoch ms on `officeLive.now`). */
export const officeReplay: { state: ReplayState; snapshot: OfficeFeedSnapshot | null; view: OfficeView | null; controller: ReplayController | null; ui: ReplayUi | null; mounted: boolean; quietSince: number; failedAt: number } = {
  state: REPLAY_OFF,
  snapshot: null,
  view: null,
  controller: null,
  ui: null,
  mounted: false,
  quietSince: 0,
  failedAt: -Infinity,
};

/** `REPLAY.idleS` and `REPLAY.retryS` of ./replay.ts in ms (that module is replay chunk only; a test pins them equal). */
const IDLE_MS = 30_000;
const RETRY_MS = 300_000;

const listeners = new Set<() => void>();
let version = 0;

/**
 * Sets the replay's state, snapshot and scene view (the replay chunk builds the view when the snapshot or `seq` changed; the
 * scene's own calls, for `mounted`, come with no replay playing).
 */
export function publishReplay(state: ReplayState, snapshot: OfficeFeedSnapshot | null, view: OfficeView | null = null): void {
  Object.assign(officeReplay, { state, snapshot, view });
  version++;
  for (const l of listeners) l();
}

/** Calls `cb` after every publish (React's stores below, and the scene's probe). */
export const subscribeReplay = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** The replay store (`officeReplay`: its state, snapshot and `mounted`), re-rendering on every publish. */
export function useReplay(): typeof officeReplay {
  const get = () => version;
  useSyncExternalStore(subscribeReplay, get, get);
  return officeReplay;
}

const view = () => officeReplay.view;

/** The scene's view: the replay's while one plays, else the live feed's; `live` is always the live view (signal, targets). */
export function useOfficeSource(): { view: OfficeView; live: OfficeView; feed: OfficeFeed } {
  const feed = useOfficeFeed();
  // The replay's view changes with its snapshot or `seq` only: a publish that moved only the day time re-renders nothing here.
  const replay = useSyncExternalStore(subscribeReplay, view, view);
  const live = useMemo(() => officeView(feed), [feed]);
  return { view: replay ?? live, live, feed };
}

/**
 * The idle loop (every 0.5 s with the scene's watch): an awake live desk or the office out of view restarts the quiet
 * timer. A feed past its first answer and not disabled (offline counts: a cached day may play), `REPLAY.idleS` quiet,
 * motion on, no replay running (off, or unavailable before) and `REPLAY.retryS` since a failed or empty attempt load
 * the replay chunk and call its `auto()`, which checks again, ends on a live event and records a failure itself
 * (`linkReplay`). A failed import waits `REPLAY.retryS` too.
 */
export function idleLoop(awake: boolean, feed: OfficeFeedStatus, inView: boolean, reduced: boolean): void {
  const r = officeReplay;
  const now = officeLive.now();
  const { status } = r.state;
  if (awake || !inView) r.quietSince = now;
  if ((feed === "ready" || feed === "offline") && now - r.quietSince >= IDLE_MS && !reduced && (status === "off" || status === "unavailable") && now - r.failedAt >= RETRY_MS)
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
