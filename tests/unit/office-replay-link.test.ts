// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { officeView } from "@/experience/floors/lobby/office/officeModel";
import { REPLAY } from "@/experience/floors/lobby/office/replay";
import { idleLoopWanted, liveEvent, liveLevels, officeReplay, publishReplay, REPLAY_OFF, replayClock, replayDayLabel, subscribeReplay, useOfficeSource, useReplay } from "@/experience/floors/lobby/office/replayLink";
import { OFFICE_FIXTURES_V4 } from "@/lib/office/fixtures";
import type { OfficeFeedSnapshot, OfficeFeedStatus } from "@/lib/office/poll";
import type { ReplayStatus } from "@/experience/floors/lobby/office/replayFeed";

const BASE = { feed: "ready" as OfficeFeedStatus, awake: false, quietMs: REPLAY.idleS * 1000, inView: true, reduced: false, status: "off" as ReplayStatus, sinceFailMs: Infinity };

afterEach(() => {
  act(() => publishReplay(REPLAY_OFF, null));
});

describe("office replay link", () => {
  it("wants the idle loop only for a quiet office in view, motion on, the replay off and no recent failure", () => {
    expect(idleLoopWanted(BASE)).toBe(true);
    // Offline counts: the loop may play a cached day.
    expect(idleLoopWanted({ ...BASE, feed: "offline" })).toBe(true);
    for (const feed of ["idle", "loading", "disabled"] as const) expect(idleLoopWanted({ ...BASE, feed }), feed).toBe(false);
    expect(idleLoopWanted({ ...BASE, awake: true })).toBe(false);
    expect(idleLoopWanted({ ...BASE, quietMs: REPLAY.idleS * 1000 - 1 })).toBe(false);
    expect(idleLoopWanted({ ...BASE, inView: false })).toBe(false);
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

  it("reads a live event: a desk waking or starting to ask", () => {
    const busy = officeView({ status: "ready", snapshot: OFFICE_FIXTURES_V4.busy as OfficeFeedSnapshot });
    const off = officeView({ status: "offline", snapshot: OFFICE_FIXTURES_V4.busy as OfficeFeedSnapshot });
    const levels = liveLevels(busy);
    expect(levels).toEqual(busy.rovers.map((r) => (!r.agent || r.state === "asleep" ? 0 : r.state === "input" ? 2 : 1)));
    expect(levels).toContain(1);
    expect(levels).toContain(2);
    expect(liveLevels(off).every((l) => l === 0)).toBe(true);
    expect(liveEvent(liveLevels(off), levels)).toBe(true);
    expect(liveEvent(levels, levels)).toBe(false);
    expect(liveEvent(levels, liveLevels(off))).toBe(false);
    expect(liveEvent([0, 1, 0], [0, 2, 0])).toBe(true);
    expect(liveEvent([2, 1, 0], [1, 1, 0])).toBe(false);
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
