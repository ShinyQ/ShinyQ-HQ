// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { officeView } from "@/experience/floors/lobby/office/officeModel";
import { REPLAY } from "@/experience/floors/lobby/office/replay";
import { idleLoopWanted, officeReplay, publishReplay, REPLAY_OFF, replayClock, replayDayLabel, subscribeReplay, useOfficeSource, useReplay } from "@/experience/floors/lobby/office/replayLink";
import { OFFICE_FIXTURES_V4 } from "@/lib/office/fixtures";
import type { OfficeFeed, OfficeFeedSnapshot, OfficeFeedStatus } from "@/lib/office/poll";
import type { ReplayStatus } from "@/experience/floors/lobby/office/replayFeed";

const BASE = { feed: "ready" as OfficeFeedStatus, quietMs: REPLAY.idleS * 1000, reduced: false, status: "off" as ReplayStatus, sinceFailMs: Infinity };
const CHUNK = "@/experience/floors/lobby/office/replayChunk";

afterEach(() => {
  act(() => publishReplay(REPLAY_OFF, null));
});

describe("office replay link", () => {
  it("wants the idle loop only for a quiet office, motion on, the replay off and no recent failure", () => {
    expect(idleLoopWanted(BASE)).toBe(true);
    // Offline counts: the loop may play a cached day.
    expect(idleLoopWanted({ ...BASE, feed: "offline" })).toBe(true);
    for (const feed of ["idle", "loading", "disabled"] as const) expect(idleLoopWanted({ ...BASE, feed }), feed).toBe(false);
    expect(idleLoopWanted({ ...BASE, quietMs: REPLAY.idleS * 1000 - 1 })).toBe(false);
    expect(idleLoopWanted({ ...BASE, reduced: true })).toBe(false);
    for (const status of ["loading", "playing", "resting", "paused"] as const) expect(idleLoopWanted({ ...BASE, status }), status).toBe(false);
    expect(idleLoopWanted({ ...BASE, status: "unavailable" })).toBe(true);
    expect(idleLoopWanted({ ...BASE, sinceFailMs: REPLAY.retryS * 1000 - 1 })).toBe(false);
    expect(idleLoopWanted({ ...BASE, sinceFailMs: REPLAY.retryS * 1000 })).toBe(true);
  });

  it("labels a day and a day time", () => {
    expect(replayDayLabel("2026-10-19", "en")).toBe("Mon 19 Oct");
    expect(replayDayLabel("2026-10-19", "id")).toBe("Sen 19 Okt");
    expect(replayClock(50_700)).toBe("14:05");
    expect(replayClock(0)).toBe("00:00");
    expect(replayClock(86_399)).toBe("23:59");
  });

  it("serves the replay's view while a snapshot is published and the live view otherwise; `live` is always the live feed's", () => {
    const hook = renderHook(() => ({ src: useOfficeSource(), replay: useReplay() }));
    const live = hook.result.current.src.live;
    expect(hook.result.current.src.view).toBe(live);
    expect(live.replay).toBeNull();
    const snapshot = OFFICE_FIXTURES_V4.busy as OfficeFeedSnapshot;
    const state = { ...REPLAY_OFF, status: "playing" as const, day: "2026-10-18", seq: 3, truncated: true, playS: 2, dayS: 40_000, auto: true };
    act(() => publishReplay(state, snapshot));
    const { src, replay } = hook.result.current;
    expect(src.view.replay).toEqual({ day: "2026-10-18", seq: 3, truncated: true });
    expect(src.view.rovers).toEqual(officeView({ status: "ready", snapshot }).rovers);
    expect(src.live).toBe(live);
    expect(src.feed.status).toBe("idle");
    expect(replay.state).toBe(state);
    expect(replay.snapshot).toBe(snapshot);
    expect(officeReplay.state).toBe(state);
    // A dayS-only publish keeps the view.
    const view = src.view;
    act(() => publishReplay({ ...state, dayS: 40_100 }, snapshot));
    expect(hook.result.current.src.view).toBe(view);
    act(() => publishReplay({ ...REPLAY_OFF, seq: 4 }, null));
    expect(hook.result.current.src.view).toBe(live);
    expect(hook.result.current.src.view.replay).toBeNull();
  });

  it("tells subscribers after every publish, until they leave", () => {
    let n = 0;
    const off = subscribeReplay(() => n++);
    publishReplay({ ...REPLAY_OFF, dayS: 1 }, null);
    publishReplay({ ...REPLAY_OFF, dayS: 2 }, null);
    off();
    publishReplay(REPLAY_OFF, null);
    expect(n).toBe(2);
  });

  it("restarts the quiet timer when a replay ends, so the idle loop waits again", () => {
    officeReplay.quietSince = 0;
    publishReplay({ ...REPLAY_OFF, status: "playing", day: "2026-10-18", auto: true }, OFFICE_FIXTURES_V4.quiet as OfficeFeedSnapshot);
    expect(officeReplay.quietSince).toBe(0);
    publishReplay(REPLAY_OFF, null);
    expect(officeReplay.quietSince).toBeGreaterThan(0);
  });
});

/** The scene's idle loop against a stub replay chunk (fresh modules per test: the loader caches its import). */
describe("office idle loop", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock(CHUNK);
  });
  const link = () => import("@/experience/floors/lobby/office/replayLink");

  it("restarts the quiet timer while a desk is awake or the office is out of view, then calls the chunk's auto()", async () => {
    const auto = vi.fn(async () => {});
    vi.doMock(CHUNK, () => ({ replayController: { auto } }));
    const { idleLoop, officeReplay: r } = await link();
    const { officeLive } = await import("@/experience/floors/lobby/office/live");
    const quiet = () => (r.quietSince = officeLive.now() - REPLAY.idleS * 1000 - 10);
    quiet();
    idleLoop(true, "ready", true, false);
    expect(officeLive.now() - r.quietSince).toBeLessThan(1000);
    quiet();
    idleLoop(false, "ready", false, false);
    expect(officeLive.now() - r.quietSince).toBeLessThan(1000);
    idleLoop(false, "ready", true, false);
    quiet();
    idleLoop(false, "ready", true, true);
    await Promise.resolve();
    expect(auto).not.toHaveBeenCalled();
    idleLoop(false, "offline", true, false);
    await vi.waitFor(() => expect(auto).toHaveBeenCalledTimes(1));
  });

  it("waits again after an auto replay stops, and never calls auto() while one runs", async () => {
    const auto = vi.fn(async () => {});
    vi.doMock(CHUNK, () => ({ replayController: { auto } }));
    const { idleLoop, officeReplay: r, publishReplay, REPLAY_OFF: OFF } = await link();
    const { officeLive } = await import("@/experience/floors/lobby/office/live");
    r.quietSince = officeLive.now() - REPLAY.idleS * 1000 - 10;
    publishReplay({ ...OFF, status: "playing", day: "2026-10-18", auto: true }, OFFICE_FIXTURES_V4.quiet as OfficeFeedSnapshot);
    idleLoop(false, "ready", true, false);
    // Stopped (a live event, "Back to live"): the quiet timer starts over.
    publishReplay(OFF, null);
    idleLoop(false, "ready", true, false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(auto).not.toHaveBeenCalled();
    expect(officeLive.now() - r.quietSince).toBeLessThan(1000);
  });

  it("records a failure when the import is rejected, and waits `REPLAY.retryS` before the next try", async () => {
    vi.doMock(CHUNK, () => {
      throw new Error("chunk");
    });
    const { idleLoop, officeReplay: r } = await link();
    const { officeLive } = await import("@/experience/floors/lobby/office/live");
    r.quietSince = officeLive.now() - REPLAY.idleS * 1000 - 10;
    idleLoop(false, "ready", true, false);
    await vi.waitFor(() => expect(r.failedAt).toBeGreaterThan(-Infinity));
    expect(officeLive.now() - r.failedAt).toBeLessThan(1000);
    // Inside `REPLAY.retryS`: no new try (a try would move `failedAt`).
    const at = (r.failedAt = officeLive.now() - REPLAY.retryS * 1000 + 5000);
    idleLoop(false, "ready", true, false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(r.failedAt).toBe(at);
  });

  it("through the chunk's link: an import that lands after the scene left, or after a live answer woke a desk, fetches nothing", async () => {
    const fetches: string[] = [];
    let feed: OfficeFeed = { status: "offline", snapshot: null, fetchedAt: 0 };
    /** Fresh modules and a stub chunk built as the real one (the live feed and the history stubbed); returns the scene's link. */
    const fresh = async () => {
      vi.resetModules();
      vi.doMock(CHUNK, async () => {
        const { createReplayFeed, linkReplay } = await import("@/experience/floors/lobby/office/replayFeed");
        const { officeLive } = await import("@/experience/floors/lobby/office/live");
        const ctl = createReplayFeed({ fetch: async (url) => (fetches.push(url), new Response(null, { status: 404 })), now: officeLive.now, reduced: () => false, publish: () => {} });
        return { replayController: linkReplay(ctl, { now: officeLive.now, feed: () => feed, subscribe: () => () => {} }, () => false) };
      });
      const l = await link();
      const { officeLive } = await import("@/experience/floors/lobby/office/live");
      l.officeReplay.mounted = true;
      l.officeReplay.quietSince = officeLive.now() - REPLAY.idleS * 1000 - 10;
      return l;
    };
    const settle = async () => {
      const m = await import(CHUNK);
      await new Promise((resolve) => setTimeout(resolve, 0));
      return m.replayController.state().status;
    };
    // Riding off L1 while the import is in flight.
    const left = await fresh();
    left.idleLoop(false, "ready", true, false);
    left.officeReplay.mounted = false;
    expect(await settle()).toBe("off");
    // A live answer with an awake desk lands before the chunk reads the feed (its first answer).
    const woke = await fresh();
    feed = { status: "ready", snapshot: OFFICE_FIXTURES_V4.busy as OfficeFeedSnapshot, fetchedAt: 1 };
    woke.idleLoop(false, "ready", true, false);
    expect(await settle()).toBe("off");
    expect(fetches).toEqual([]);
    expect(woke.officeReplay.failedAt).toBe(-Infinity);
    // A quiet office plays (here the history is unavailable: a failure recorded).
    const quiet = await fresh();
    feed = { status: "ready", snapshot: { ...(OFFICE_FIXTURES_V4.quiet as OfficeFeedSnapshot), desks: [] }, fetchedAt: 2 };
    quiet.idleLoop(false, "ready", true, false);
    await vi.waitFor(() => expect(quiet.officeReplay.failedAt).toBeGreaterThan(-Infinity));
    expect(await settle()).toBe("unavailable");
    expect(fetches).toHaveLength(1);
  });
});
