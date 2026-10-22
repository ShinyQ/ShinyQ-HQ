import { beforeEach, describe, expect, it, vi } from "vitest";
import { clockOf, dayLabel, dayTime, planReplay, REPLAY } from "@/experience/floors/lobby/office/replay";
import { createReplayFeed, linkReplay, liveMark, snapKey, type ReplayState } from "@/experience/floors/lobby/office/replayFeed";
import { officeReplay } from "@/experience/floors/lobby/office/replayLink";
import { OFFICE_FIXTURE_NOW, OFFICE_HISTORY_FIXTURES } from "@/lib/office/fixtures";
import type { OfficeFeed, OfficeFeedSnapshot } from "@/lib/office/poll";
import type { OfficeDeskV2, OfficePipelineRun, OfficeShip } from "@/lib/office/protocol";
import { dayStart, OFFICE_HISTORY_PATH, type OfficeHistoryIndexV1, type OfficeHistoryV1 } from "@/lib/office/protocolHistory";

const { index: INDEX, day: DAY } = OFFICE_HISTORY_FIXTURES;
const TODAY = INDEX.days[0].day;
const PLAN = planReplay(DAY)!;

type Answer = { status: number; body?: unknown } | "throw";

/** A replay feed over a stub fetch (`answer` per URL, the fixtures by default), a fake clock (moved by hand only) and a publish log. */
function harness(opts: { index?: Answer; day?: (day: string) => Answer; reduced?: boolean; hang?: boolean } = {}) {
  const calls: string[] = [];
  const clock = { now: OFFICE_FIXTURE_NOW };
  const published: { state: ReplayState; snapshot: OfficeFeedSnapshot | null }[] = [];
  const reduced = { on: opts.reduced ?? false };
  const locale = { is: "en" as "en" | "id" };
  const fail = { index: false, day: false };
  const input = { active: true };
  const answer = (url: string): Answer => {
    if (url === OFFICE_HISTORY_PATH) return fail.index ? { status: 503, body: { v: 1, error: "office" } } : (opts.index ?? { status: 200, body: INDEX });
    if (fail.day) return { status: 404, body: { v: 1, error: "day" } };
    const day = new URL(url, "https://hq.test").searchParams.get("day")!;
    return opts.day ? opts.day(day) : day === DAY.day ? { status: 200, body: DAY } : { status: 404, body: { v: 1, error: "day" } };
  };
  const feed = createReplayFeed({
    fetch: async (url) => {
      calls.push(url);
      if (opts.hang) await new Promise(() => {});
      const a = answer(url);
      if (a === "throw") throw new TypeError("network");
      return new Response(JSON.stringify(a.body ?? null), { status: a.status });
    },
    now: () => clock.now,
    active: () => input.active,
    reduced: () => reduced.on,
    locale: () => locale.is,
    publish: (state, snapshot) => published.push({ state, snapshot }),
  });
  const last = () => published.at(-1)!;
  /** Steps `s` seconds of playback in frames of `dt`. */
  const play = (s: number, dt = 0.05) => {
    for (let t = 0; t < s - 1e-9; t += dt) feed.step(dt, reduced.on);
  };
  return { feed, calls, clock, published, last, play, reduced, locale, fail, input };
}

/** A live snapshot at `at` with `desks` (slot, state) and deploy ships (time, status). */
function liveSnap(at: number, desks: [number, OfficeDeskV2["state"]][] = [], deploys: [number, OfficeShip["status"]][] = []): OfficeFeedSnapshot {
  return {
    v: 4,
    enabled: true,
    mode: "live",
    updatedAt: at,
    desks: desks.map(([slot, state]) => ({ slot, agent: "claude", state, activity: state === "asleep" ? "resting" : state === "input" ? "asking" : "editing", since: at, recent: [] })),
    extra: 0,
    github: [],
    today: { day: TODAY, tasksDone: 0, prsMerged: 0, ciRuns: 0, ciGreen: 0 },
    pipeline: { runs: [], ships: deploys.map(([t, status], i) => ({ key: `deploy:${i}`, kind: "deploy", status, at: t })) },
  };
}
const ready = (snapshot: OfficeFeedSnapshot): OfficeFeed => ({ status: "ready", snapshot, fetchedAt: snapshot.updatedAt });

/**
 * The harness's feed tied to a stub live feed (`linkReplay`, as the replay chunk does) on the harness clock: the scene
 * mounted and quiet for `REPLAY.idleS`, no failure yet. `push` lands a new live answer.
 */
function linked(first: OfficeFeed, opts: Parameters<typeof harness>[0] = {}) {
  const h = harness(opts);
  officeReplay.mounted = true;
  officeReplay.quietSince = h.clock.now - REPLAY.idleS * 1000;
  officeReplay.failedAt = -Infinity;
  let current = first;
  const subs = new Set<(f: OfficeFeed) => void>();
  const ctl = linkReplay(h.feed, { now: () => h.clock.now, feed: () => current, subscribe: (cb) => (subs.add(cb), () => void subs.delete(cb)) }, () => h.reduced.on);
  const push = (f: OfficeFeed) => {
    current = f;
    for (const cb of subs) cb(f);
  };
  return { ...h, ctl, push };
}

/** The fixture day moved to `day` (an older day in the window). */
const dayAs = (day: string): OfficeHistoryV1 => ({ ...DAY, day, start: dayStart(day) });

/** One full loop of the harness's plan in seconds, rest included. */
const REPLAY_LAP = () => PLAN.duration + REPLAY.restS + 0.2;

describe("office replay feed", () => {
  it("auto() fetches the index once, picks today when it has anything and plays it with a snapshot published", async () => {
    const h = harness();
    await h.feed.auto();
    expect(h.calls).toEqual([OFFICE_HISTORY_PATH, `${OFFICE_HISTORY_PATH}?day=${TODAY}`]);
    const { state, snapshot } = h.last();
    expect(state).toMatchObject({ status: "playing", day: TODAY, auto: true, playS: 0, duration: PLAN.duration, truncated: false, empty: false });
    expect(state.days).toEqual(INDEX.days);
    expect(state.seq).toBeGreaterThan(0);
    expect(snapshot?.v).toBe(4);
    expect(state.dayS).toBe(Math.round(dayTime(PLAN, 0)));
    expect(state.clock).toBe(clockOf(state.dayS));
    expect(state.label).toBe(dayLabel(TODAY, "en"));
    // A second auto() while playing does nothing.
    await h.feed.auto();
    expect(h.calls).toHaveLength(2);
  });

  it("picks the newest of the last 7 days with anything when today is empty", async () => {
    const older = INDEX.days[2].day;
    const index: OfficeHistoryIndexV1 = { v: 1, days: INDEX.days.map((d, i) => (i === 2 ? { ...INDEX.days[0], day: older } : i === 5 ? { ...INDEX.days[0], day: d.day } : { ...d, events: 0, prs: 0, runs: 0, deploys: 0 })) };
    const h = harness({ index: { status: 200, body: index }, day: (day) => ({ status: 200, body: dayAs(day) }) });
    await h.feed.auto();
    expect(h.calls).toEqual([OFFICE_HISTORY_PATH, `${OFFICE_HISTORY_PATH}?day=${older}`]);
    expect(h.last().state).toMatchObject({ status: "playing", day: older });
  });

  it("rests 6 s at the end holding the last snapshot, then loops from 0 with `seq` bumped and no fetch; today refetches once its copy is over 5 min old and a visitor is about", async () => {
    const h = harness();
    await h.feed.auto();
    const seq = h.last().state.seq;
    h.play(PLAN.duration + 0.1);
    const end = h.last();
    expect(end.state.status).toBe("resting");
    expect(end.snapshot).not.toBeNull();
    h.play(REPLAY.restS - 0.5);
    expect(h.last().state.status).toBe("resting");
    expect(h.last().snapshot).toBe(end.snapshot);
    h.play(1);
    expect(h.last().state).toMatchObject({ status: "playing", seq: seq + 1 });
    expect(h.last().state.playS).toBeLessThan(1);
    expect(h.calls).toHaveLength(2);
    // The second loop ends over 5 min after the first fetch: today is fetched again (the index too).
    h.clock.now += REPLAY.retryS * 1000 + 1;
    h.play(PLAN.duration + REPLAY.restS + 0.2);
    await vi.waitFor(() => expect(h.last().state.status).toBe("playing"));
    expect(h.calls.filter((c) => c.endsWith(`?day=${TODAY}`))).toHaveLength(2);
    expect(h.calls.filter((c) => c === OFFICE_HISTORY_PATH)).toHaveLength(2);
  });

  describe("today's copy at a loop restart", () => {
    const lap = REPLAY_LAP;
    const refetches = (h: ReturnType<typeof harness>) => h.calls.filter((c) => c.endsWith(`?day=${TODAY}`)).length;

    it("is not fetched again without visitor input, however old: the parked tab loops its copy", async () => {
      const h = harness();
      await h.feed.auto();
      h.input.active = false;
      for (let i = 0; i < 5; i++) {
        h.clock.now += 3_600_000;
        h.play(lap());
        expect(h.last().state.status).toBe("playing");
      }
      expect(h.calls).toHaveLength(2);
    });

    it("is fetched at most once per 5 min while there is input", async () => {
      const h = harness();
      await h.feed.auto();
      // Loops every 66 to 72 s: only the one that ends over 5 min after the copy fetches again.
      const end = h.clock.now + REPLAY.retryS * 1000;
      let loops = 0;
      while (h.clock.now < end + 120_000) {
        h.clock.now += 70_000;
        h.play(lap());
        await vi.waitFor(() => expect(h.last().state.status).toBe("playing"));
        loops++;
      }
      expect(loops).toBeGreaterThanOrEqual(6);
      expect(refetches(h)).toBe(2);
      expect(h.calls.filter((c) => c === OFFICE_HISTORY_PATH)).toHaveLength(2);
    });

    it("follows the same rule when a visitor pauses during the rest and resumes", async () => {
      const h = harness();
      await h.feed.auto();
      h.play(PLAN.duration + 0.1);
      expect(h.last().state.status).toBe("resting");
      h.feed.pause();
      expect(h.last().state.status).toBe("paused");
      // Young copy: resumes from the start without a fetch.
      h.clock.now += REPLAY.retryS * 1000 - 1000;
      h.feed.resume();
      expect(h.last().state).toMatchObject({ status: "playing", playS: 0 });
      expect(h.calls).toHaveLength(2);
      h.play(PLAN.duration + 0.1);
      h.feed.pause();
      // Old copy, no input: no fetch.
      h.clock.now += 2000;
      h.input.active = false;
      h.feed.resume();
      expect(h.last().state).toMatchObject({ status: "playing", playS: 0 });
      expect(h.calls).toHaveLength(2);
      h.play(PLAN.duration + 0.1);
      h.feed.pause();
      // Old copy and input: today is loaded again before it plays.
      h.input.active = true;
      h.feed.resume();
      await vi.waitFor(() => expect(h.last().state).toMatchObject({ status: "playing", playS: 0, auto: true }));
      expect(refetches(h)).toBe(2);
    });
  });

  it("play(day) is the visitor's (auto false) and ends paused instead of looping; stop() publishes off and no snapshot", async () => {
    const h = harness();
    await h.feed.play(TODAY);
    expect(h.last().state).toMatchObject({ status: "playing", auto: false, day: TODAY });
    h.play(PLAN.duration + REPLAY.restS + 1);
    expect(h.last().state.status).toBe("paused");
    expect(h.last().state.playS).toBe(PLAN.duration);
    h.feed.stop();
    expect(h.last().state).toMatchObject({ status: "off", day: null, auto: false, playS: 0 });
    expect(h.last().snapshot).toBeNull();
    // Stopped while loading (the copies are over 60 s old, so it fetches): the load lands silently.
    h.clock.now += 61_000;
    const calls = h.calls.length;
    const pending = h.feed.play(TODAY);
    expect(h.last().state.status).toBe("loading");
    h.feed.stop();
    await pending;
    expect(h.calls.length).toBeGreaterThan(calls);
    expect(h.last().state.status).toBe("off");
    expect(h.last().snapshot).toBeNull();
  });

  it.each<[string, Parameters<typeof harness>[0]]>([
    ["a non-200 index", { index: { status: 503, body: { v: 1, error: "office" } } }],
    ["a thrown fetch", { index: "throw" }],
    ["an index the parser rejects", { index: { status: 200, body: { v: 1, days: [] } } }],
    ["a disabled index", { index: { status: 200, body: { v: 1, enabled: false } } }],
    ["a non-200 day", { day: () => ({ status: 404, body: { v: 1, error: "day" } }) }],
    ["a thrown day fetch", { day: () => "throw" }],
    ["a day the parser rejects", { day: () => ({ status: 200, body: { ...DAY, start: 0 } }) }],
    ["a disabled day", { day: () => ({ status: 200, body: { v: 1, enabled: false } }) }],
  ])("gives `unavailable` and no snapshot on %s", async (_, opts) => {
    const h = harness(opts);
    await h.feed.auto();
    expect(h.last().state.status).toBe("unavailable");
    expect(h.last().snapshot).toBeNull();
    // auto() may try again (the scene's idle rule waits 5 min first).
    await h.feed.auto();
    expect(h.last().state.status).toBe("unavailable");
  });

  it("gives `off` with `empty` when no day in the window has anything to play", async () => {
    const index: OfficeHistoryIndexV1 = { v: 1, days: INDEX.days.map((d) => ({ ...d, events: 0, prs: 0, runs: 0, deploys: 0 })) };
    const h = harness({ index: { status: 200, body: index } });
    await h.feed.auto();
    expect(h.calls).toEqual([OFFICE_HISTORY_PATH]);
    expect(h.last().state).toMatchObject({ status: "off", empty: true, days: index.days });
    expect(h.last().snapshot).toBeNull();
    // A day with counts but nothing that plays (only asleep events).
    const quiet = harness({ day: () => ({ status: 200, body: { ...DAY, events: [], prs: [], runs: [], deploys: [] } }) });
    await quiet.feed.auto();
    expect(quiet.last().state).toMatchObject({ status: "off", empty: true });
  });

  it("publishes at most once per tick of playback, a new snapshot only when its content changed, and `dayS` every tick", async () => {
    const h = harness();
    await h.feed.auto();
    const from = h.published.length;
    const s = 10;
    h.play(s, 0.02);
    const out = h.published.slice(from);
    expect(out.length).toBeLessThanOrEqual(Math.ceil(s / REPLAY.tickS) + 1);
    expect(out.length).toBeGreaterThan(s / REPLAY.tickS / 2);
    const snaps = out.map((p) => p.snapshot!);
    for (let i = 1; i < snaps.length; i++) {
      if (snaps[i] !== snaps[i - 1]) expect(snapKey(snaps[i])).not.toBe(snapKey(snaps[i - 1]));
    }
    expect(new Set(snaps).size).toBeLessThan(snaps.length);
    const days = out.map((p) => p.state.dayS);
    expect(days.every((d, i) => i === 0 || d >= days[i - 1])).toBe(true);
    expect(new Set(days).size).toBeGreaterThan(out.length / 2);
  });

  it("keys a snapshot on its desks, helpers, pipeline statuses and today's counts", () => {
    const a: OfficeFeedSnapshot = { v: 4, enabled: true, mode: "live", updatedAt: 1, desks: [], extra: 0, github: [], today: { day: TODAY, tasksDone: 0, prsMerged: 0, ciRuns: 0, ciGreen: 0 }, pipeline: { runs: [], ships: [] } };
    const desk = { slot: 1, agent: "claude" as const, state: "working" as const, activity: "editing" as const, since: 1, recent: [] };
    expect(snapKey({ ...a, updatedAt: 2 })).toBe(snapKey(a));
    expect(snapKey({ ...a, desks: [desk] })).not.toBe(snapKey(a));
    expect(snapKey({ ...a, desks: [{ ...desk, helpers: 2 }] })).not.toBe(snapKey({ ...a, desks: [desk] }));
    expect(snapKey({ ...a, desks: [{ ...desk, since: 9 }] })).toBe(snapKey({ ...a, desks: [desk] }));
    expect(snapKey({ ...a, today: { ...a.today!, ciGreen: 1 } })).not.toBe(snapKey(a));
    const run: OfficePipelineRun = { id: -1, repo: "", title: "", url: "", status: "running", at: 1, jobs: [{ name: "Job", status: "running" }] };
    const p = (r: OfficePipelineRun) => ({ ...a, pipeline: { runs: [r], ships: [] } });
    expect(snapKey(p({ ...run, jobs: [{ name: "Job", status: "done" }] }))).not.toBe(snapKey(p(run)));
    const ship = { key: "deploy:0", kind: "deploy" as const, status: "running" as const, at: 1 };
    expect(snapKey({ ...a, pipeline: { runs: [], ships: [{ ...ship, status: "success" }] } })).not.toBe(snapKey({ ...a, pipeline: { runs: [], ships: [ship] } }));
  });

  it("under reduced motion never steps, starts a visitor's day paused at its first activity and moves by whole hours", async () => {
    const h = harness({ reduced: true });
    await h.feed.play(TODAY);
    const first = h.last().state;
    expect(first).toMatchObject({ status: "paused", auto: false, day: TODAY });
    expect(first.dayS).toBe(PLAN.spans[0].from);
    h.play(5);
    expect(h.last().state.playS).toBe(first.playS);
    h.feed.resume();
    expect(h.last().state.status).toBe("paused");
    h.feed.nextHour();
    expect(h.last().state.dayS).toBe((Math.floor(first.dayS / REPLAY.stepS) + 1) * REPLAY.stepS);
    expect(h.last().state.seq).toBe(first.seq + 1);
    h.feed.nextHour();
    expect(h.last().state.dayS).toBe((Math.floor(first.dayS / REPLAY.stepS) + 2) * REPLAY.stepS);
    for (let i = 0; i < 30; i++) h.feed.nextHour();
    expect(h.last().state.playS).toBe(PLAN.duration);
  });

  it("pauses, resumes and seeks (clamped), each seek a fresh baseline", async () => {
    const h = harness();
    await h.feed.play(TODAY);
    h.play(2);
    h.feed.pause();
    expect(h.last().state.status).toBe("paused");
    const at = h.last().state.playS;
    h.play(2);
    expect(h.feed.state().playS).toBe(at);
    h.feed.resume();
    expect(h.last().state.status).toBe("playing");
    const seq = h.last().state.seq;
    h.feed.seek(PLAN.duration + 100);
    expect(h.last().state).toMatchObject({ playS: PLAN.duration, seq: seq + 1 });
    h.feed.seek(-5);
    expect(h.last().state.playS).toBe(0);
  });

  it("pauses an `auto` replay while it rests and resumes it from the start; a visitor's day paused at its end plays again from 0", async () => {
    const h = harness();
    await h.feed.auto();
    h.play(PLAN.duration + 0.1);
    expect(h.last().state.status).toBe("resting");
    h.feed.pause();
    expect(h.last().state.status).toBe("paused");
    h.play(REPLAY.restS + 1);
    expect(h.last().state.status).toBe("paused");
    h.feed.resume();
    expect(h.last().state).toMatchObject({ status: "playing", playS: 0 });
    h.play(1);
    expect(h.last().state.status).toBe("playing");
    expect(h.last().state.playS).toBeGreaterThan(0.5);
    const v = harness();
    await v.feed.play(TODAY);
    v.play(PLAN.duration + 1);
    expect(v.last().state).toMatchObject({ status: "paused", playS: PLAN.duration });
    v.feed.resume();
    v.play(0.5);
    expect(v.last().state.status).toBe("playing");
    expect(v.last().state.playS).toBeLessThan(2);
  });

  it("labels the day in the page's locale, and a load that ends without a day drops the old day and label", async () => {
    const h = harness();
    h.locale.is = "id";
    await h.feed.play(TODAY);
    expect(h.last().state.label).toBe(dayLabel(TODAY, "id"));
    h.clock.now += 61_000;
    h.fail.index = true;
    await h.feed.play(TODAY);
    expect(h.last().state).toMatchObject({ status: "unavailable", day: null, label: null });
    h.fail.index = false;
    await h.feed.play(TODAY);
    h.clock.now += 61_000;
    h.fail.day = true;
    await h.feed.play(TODAY);
    expect(h.last().state).toMatchObject({ status: "unavailable", day: null, label: null });
  });

  it("keeps the playback time off the published state between ticks, and state() reads it exact", async () => {
    const h = harness();
    await h.feed.play(TODAY);
    h.feed.step(REPLAY.tickS / 5, false);
    const before = h.published.length;
    const s = h.last().state;
    h.feed.step(REPLAY.tickS / 5, false);
    h.feed.step(REPLAY.tickS / 5, false);
    expect(h.published.length).toBe(before);
    expect(h.last().state).toBe(s);
    expect(s.playS).toBeLessThan((REPLAY.tickS * 2) / 5);
    expect(h.feed.state().playS).toBeCloseTo((REPLAY.tickS * 3) / 5, 9);
    h.feed.pause();
    expect(h.last().state.playS).toBeCloseTo((REPLAY.tickS * 3) / 5, 9);
  });

  it("ends an `auto` replay on a reduced-motion step, never a visitor's", async () => {
    const h = harness();
    await h.feed.auto();
    h.feed.step(0.1, true);
    expect(h.last().state).toMatchObject({ status: "off", auto: false });
    await h.feed.play(TODAY);
    h.feed.step(0.1, true);
    expect(h.last().state).toMatchObject({ status: "playing", auto: false });
  });
});

describe("office replay controls' index", () => {
  it("open() publishes the days without playing, so the drawer's day buttons show; the day buttons then play", async () => {
    const h = harness();
    await h.feed.open();
    expect(h.calls).toEqual([OFFICE_HISTORY_PATH]);
    expect(h.last()).toMatchObject({ state: { status: "off", days: INDEX.days, empty: false, day: null }, snapshot: null });
    await h.feed.play(TODAY);
    expect(h.last().state.status).toBe("playing");
    // Playing already: nothing to fetch.
    await h.feed.open();
    expect(h.calls).toHaveLength(2);
  });

  it("open() says unavailable when the index cannot load, and nothing to play when no day has activity", async () => {
    const down = harness({ index: { status: 404, body: { v: 1, error: "off" } } });
    await down.feed.open();
    expect(down.last().state.status).toBe("unavailable");
    const days = INDEX.days.map((d) => ({ ...d, events: 0, prs: 0, runs: 0, deploys: 0 }));
    const quiet = harness({ index: { status: 200, body: { ...INDEX, days } } });
    await quiet.feed.open();
    expect(quiet.last().state).toMatchObject({ status: "off", empty: true });
  });

  it("keeps the clock on every tick's state", async () => {
    const h = harness();
    await h.feed.play(TODAY);
    h.play(5);
    const { state } = h.last();
    expect(state.clock).toBe(clockOf(state.dayS));
    expect(state.dayS).toBeGreaterThan(Math.round(dayTime(PLAN, 0)));
  });
});

describe("office replay link to the live feed", () => {
  beforeEach(() => {
    officeReplay.mounted = false;
    officeReplay.quietSince = 0;
    officeReplay.failedAt = -Infinity;
  });

  it("reads a live snapshot's desk levels and latest production deploy", () => {
    const m = liveMark(liveSnap(5000, [[0, "working"], [3, "input"], [4, "asleep"]], [[1000, "success"], [3000, "running"], [2000, "failure"], [1500, "success"]]));
    expect(m.levels).toEqual([1, 0, 0, 2, 0, 0, 0, 0, 0, 0]);
    expect(m.deployAt).toBe(1500);
    expect(liveMark({ ...liveSnap(5000, [[0, "working"]]), mode: "off" }).levels.every((l) => l === 0)).toBe(true);
    expect(liveMark({ ...liveSnap(5000), pipeline: undefined }).deployAt).toBe(0);
  });

  it("a fresh live production deploy ends any replay and restarts the quiet timer, a replay or not", async () => {
    const t0 = OFFICE_FIXTURE_NOW;
    const h = linked(ready(liveSnap(t0, [], [[t0 - 600_000, "success"]])));
    await h.ctl.auto();
    expect(h.last().state).toMatchObject({ status: "playing", auto: true });
    // A running deploy is not an event; the same deploy again is not either.
    h.push(ready(liveSnap(t0 + 5000, [], [[t0 - 600_000, "success"], [t0 + 4000, "running"]])));
    expect(h.last().state.status).toBe("playing");
    h.clock.now += 1000;
    h.push(ready(liveSnap(t0 + 10_000, [], [[t0 - 600_000, "success"], [t0 + 9000, "success"]])));
    expect(h.last().state.status).toBe("off");
    expect(officeReplay.quietSince).toBe(h.clock.now);
    // A visitor's replay ends too.
    await h.ctl.play(TODAY);
    h.push(ready(liveSnap(t0 + 20_000, [], [[t0 + 19_000, "success"]])));
    expect(h.last().state.status).toBe("off");
    // No replay running: only the quiet timer.
    h.clock.now += 1000;
    h.push(ready(liveSnap(t0 + 40_000, [], [[t0 + 39_000, "success"]])));
    expect(officeReplay.quietSince).toBe(h.clock.now);
  });

  it("a desk waking or starting to ask ends any replay; an awake desk ends an `auto` one, not a visitor's", async () => {
    const t0 = OFFICE_FIXTURE_NOW;
    const h = linked(ready(liveSnap(t0, [[2, "asleep"]])));
    await h.ctl.play(TODAY);
    h.push(ready(liveSnap(t0 + 1000, [[2, "working"]])));
    expect(h.last().state.status).toBe("off");
    // Awake already (no rise): a visitor's replay holds; then a desk starts to ask.
    await h.ctl.play(TODAY);
    h.push(ready(liveSnap(t0 + 2000, [[2, "working"]])));
    expect(h.last().state.status).toBe("playing");
    h.push(ready(liveSnap(t0 + 3000, [[2, "input"]])));
    expect(h.last().state.status).toBe("off");
    // An auto replay on a quiet office, then the office is awake without a rise (an offline answer between).
    h.push(ready(liveSnap(t0 + 4000, [[2, "asleep"]])));
    h.clock.now += REPLAY.idleS * 1000;
    await h.ctl.auto();
    expect(h.last().state).toMatchObject({ status: "playing", auto: true });
    h.push({ status: "offline", snapshot: null, fetchedAt: 0 });
    expect(h.last().state.status).toBe("playing");
    h.push(ready(liveSnap(t0 + 5000, [[2, "asleep"], [7, "done"]])));
    expect(h.last().state.status).toBe("off");
  });

  it("auto() checks the idle rule again: an import that lands after a desk woke, a fresh deploy, an unmount or reduced motion plays nothing", async () => {
    const t0 = OFFICE_FIXTURE_NOW;
    // The import resolved after a live answer with an awake desk landed (the chunk's first answer).
    const woke = linked(ready(liveSnap(t0, [[1, "working"]])));
    await woke.ctl.auto();
    expect(woke.calls).toEqual([]);
    expect(officeReplay.quietSince).toBe(woke.clock.now);
    // ... or a production deploy under 30 s old.
    const deployed = linked(ready(liveSnap(t0, [], [[t0 - 10_000, "success"]])));
    await deployed.ctl.auto();
    expect(deployed.calls).toEqual([]);
    // The scene left (riding off L1) while the import was in flight.
    const left = linked(ready(liveSnap(t0)));
    officeReplay.mounted = false;
    await left.ctl.auto();
    expect(left.calls).toEqual([]);
    officeReplay.mounted = true;
    left.reduced.on = true;
    await left.ctl.auto();
    expect(left.calls).toEqual([]);
    left.reduced.on = false;
    officeReplay.quietSince = left.clock.now - REPLAY.idleS * 1000 + 1;
    await left.ctl.auto();
    expect(left.calls).toEqual([]);
    officeReplay.quietSince = left.clock.now - REPLAY.idleS * 1000;
    await left.ctl.auto();
    expect(left.last().state).toMatchObject({ status: "playing", auto: true });
    expect(officeReplay.failedAt).toBe(-Infinity);
  });

  it("a live event during auto()'s fetch drops the load", async () => {
    const t0 = OFFICE_FIXTURE_NOW;
    const h = linked(ready(liveSnap(t0)), { hang: true });
    void h.ctl.auto();
    await vi.waitFor(() => expect(h.calls).toHaveLength(1));
    expect(h.last().state.status).toBe("loading");
    h.push(ready(liveSnap(t0 + 1000, [[0, "working"]])));
    expect(h.last().state.status).toBe("off");
  });

  it.each<[string, Parameters<typeof harness>[0], Partial<ReplayState>]>([
    ["an unavailable history", { index: { status: 503, body: { v: 1, error: "office" } } }, { status: "unavailable" }],
    ["nothing to play", { index: { status: 200, body: { v: 1, days: INDEX.days.map((d) => ({ ...d, events: 0, prs: 0, runs: 0, deploys: 0 })) } } }, { status: "off", empty: true }],
  ])("auto() records a failure on %s", async (_, opts, state) => {
    const h = linked(ready(liveSnap(OFFICE_FIXTURE_NOW)), opts);
    await h.ctl.auto();
    expect(h.last().state).toMatchObject(state);
    expect(officeReplay.failedAt).toBe(h.clock.now);
  });

  it("auto() records a failure on a throw", async () => {
    const h = linked(ready(liveSnap(OFFICE_FIXTURE_NOW)));
    const ctl = linkReplay({ ...h.feed, auto: () => Promise.reject(new Error("boom")) }, { now: () => h.clock.now, feed: () => ({ status: "offline", snapshot: null, fetchedAt: 0 }), subscribe: () => () => {} }, () => false);
    await ctl.auto();
    expect(officeReplay.failedAt).toBe(h.clock.now);
  });
});
