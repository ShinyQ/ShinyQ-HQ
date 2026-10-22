// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFFICE_HISTORY_FIXTURES } from "@/lib/office/fixtures";
import { OFFICE_HISTORY_PATH } from "@/lib/office/protocolHistory";

const { index, day } = OFFICE_HISTORY_FIXTURES;
const feed = vi.hoisted(() => ({ status: "idle", snapshot: null, fetchedAt: 0 }));
vi.mock("@/experience/floors/lobby/office/live", () => ({
  officeLive: { now: () => Date.now(), feed: () => feed, subscribe: () => () => {}, want: vi.fn(), wanted: () => false },
  useOfficeFeed: () => feed,
}));

import { dayLabel, clockOf } from "@/experience/floors/lobby/office/replay";
import { replayController } from "@/experience/floors/lobby/office/replayChunk";
import { officeReplay, publishReplay, REPLAY_OFF } from "@/experience/floors/lobby/office/replayLink";
import { replayUi } from "@/experience/floors/lobby/office/ReplayPill";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => new Response(JSON.stringify(url === OFFICE_HISTORY_PATH ? index : day), { status: 200 })),
  );
});
afterEach(() => {
  replayController.stop();
  publishReplay(REPLAY_OFF, null);
  vi.unstubAllGlobals();
});

describe("replay chunk entry", () => {
  it("registers the controller and the pill UI on the scene chunk's store", () => {
    expect(officeReplay.controller).toBe(replayController);
    expect(officeReplay.ui).toBe(replayUi);
  });

  it("publishes the scene's view of the replay: its day, seq, truncation and labels, the clock on the state; the view stays while only the day time moves", async () => {
    expect(officeReplay.view).toBeNull();
    await replayController.play(day.day);
    const { state, snapshot, view } = officeReplay;
    expect(state.status).toBe("playing");
    expect(view?.replay).toEqual({ day: day.day, seq: state.seq, truncated: false, label: { en: dayLabel(day.day, "en"), id: dayLabel(day.day, "id") } });
    expect(view?.rovers).toHaveLength(10);
    expect(state.clock).toBe(clockOf(state.dayS));
    // A pause keeps the snapshot and seq: the same view (the scene re-renders nothing).
    replayController.pause();
    expect(officeReplay.state.status).toBe("paused");
    expect(officeReplay.snapshot).toBe(snapshot);
    expect(officeReplay.view).toBe(view);
    // A seek is a fresh baseline: a new view with the new seq.
    replayController.seek(1);
    expect(officeReplay.view).not.toBe(view);
    expect(officeReplay.view?.replay?.seq).toBe(officeReplay.state.seq);
    // Back to live: no view.
    replayController.stop();
    expect(officeReplay.view).toBeNull();
    expect(officeReplay.snapshot).toBeNull();
  });

  it("restarts the quiet timer when a replay ends (a live event, Back to live), so the idle loop waits again", async () => {
    await replayController.play(day.day);
    officeReplay.quietSince = 0;
    replayController.pause();
    expect(officeReplay.quietSince).toBe(0);
    replayController.stop();
    expect(officeReplay.quietSince).toBeGreaterThan(0);
    // Already off: nothing to restart.
    officeReplay.quietSince = 0;
    replayController.stop();
    expect(officeReplay.quietSince).toBe(0);
  });
});
