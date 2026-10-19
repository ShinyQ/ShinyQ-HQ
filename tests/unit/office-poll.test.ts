import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFFICE_FIXTURES } from "@/lib/office/fixtures";
import { createOfficePoller, POLL, pollInterval, type OfficeFeed } from "@/lib/office/poll";
import { OFFICE_PATH } from "@/lib/office/protocol";
import { officeDesk, officeSnapshot, statesA } from "../../e2e/office-fixtures";

const T0 = 1_800_000_000_000;
type Reply = { status: number; body?: unknown };

/**
 * A fetch stand-in that answers from `replies` (the last one repeats) and records each call. It returns a minimal
 * response object (status and json) rather than a real `Response`, so no body stream depends on faked timers.
 */
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return { status: r.status, json: async () => r.body ?? null } as unknown as Response;
  });
  return { fetcher: fetcher as unknown as typeof fetch, calls };
}

const asleep = (now: number) => officeSnapshot([officeDesk(0, "codex", "asleep", "resting", now)], now);

beforeEach(() => vi.useFakeTimers({ now: T0 }));
afterEach(() => vi.useRealTimers());

describe("createOfficePoller", () => {
  it("fetches /api/office at once (JSON, no credentials) and every 10 s while a desk is awake", async () => {
    const { fetcher, calls } = fakeFetch([{ status: 200, body: statesA(T0) }]);
    const poller = createOfficePoller({ fetcher });
    const seen: OfficeFeed[] = [];
    poller.subscribe((feed) => seen.push(feed));
    poller.start();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(OFFICE_PATH);
    expect(calls[0].init).toEqual({ headers: { accept: "application/json" }, credentials: "omit" });
    expect(poller.feed()).toMatchObject({ status: "ready", fetchedAt: T0 });
    expect(seen.map((f) => f.status)).toEqual(["loading", "ready"]);
    await vi.advanceTimersByTimeAsync(POLL.activeMs);
    expect(calls).toHaveLength(2);
  });

  it("slows to 30 s when every desk is asleep, the feed is semi-live or off, or there is no snapshot", async () => {
    expect(pollInterval({ status: "ready", snapshot: asleep(T0), fetchedAt: T0 })).toBe(POLL.restingMs);
    expect(pollInterval({ status: "ready", snapshot: { ...statesA(T0), mode: "semi-live" }, fetchedAt: T0 })).toBe(POLL.restingMs);
    expect(pollInterval({ status: "ready", snapshot: { ...statesA(T0), mode: "off" }, fetchedAt: T0 })).toBe(POLL.restingMs);
    expect(pollInterval({ status: "idle", snapshot: null, fetchedAt: 0 })).toBe(POLL.restingMs);
    const { fetcher, calls } = fakeFetch([{ status: 200, body: asleep(T0) }]);
    const poller = createOfficePoller({ fetcher });
    poller.start();
    await vi.advanceTimersByTimeAsync(POLL.activeMs);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(POLL.restingMs - POLL.activeMs);
    expect(calls).toHaveLength(2);
  });

  it("does not fetch while the page is hidden and fetches on the first tick after it shows again", async () => {
    let visible = false;
    const { fetcher, calls } = fakeFetch([{ status: 200, body: statesA(T0) }]);
    const poller = createOfficePoller({ fetcher, visible: () => visible });
    poller.start();
    await vi.advanceTimersByTimeAsync(POLL.restingMs * 2);
    expect(calls).toHaveLength(0);
    visible = true;
    await vi.advanceTimersByTimeAsync(POLL.restingMs);
    expect(calls).toHaveLength(1);
  });

  it("stops after 10 minutes without visitor input and restarts at once on touch()", async () => {
    const { fetcher, calls } = fakeFetch([{ status: 200, body: asleep(T0) }]);
    const poller = createOfficePoller({ fetcher });
    poller.start();
    await vi.advanceTimersByTimeAsync(POLL.idleStopMs);
    expect(calls).toHaveLength(POLL.idleStopMs / POLL.restingMs);
    await vi.advanceTimersByTimeAsync(POLL.restingMs * 4);
    expect(calls).toHaveLength(POLL.idleStopMs / POLL.restingMs);
    poller.touch();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(POLL.idleStopMs / POLL.restingMs + 1);
  });

  it("keeps the last good snapshot for 60 s after errors, then reports offline and keeps it for the last known events", async () => {
    const good = statesA(T0);
    const { fetcher } = fakeFetch([{ status: 200, body: good }, { status: 500 }]);
    const poller = createOfficePoller({ fetcher });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    for (let s = 1; s < POLL.keepLastMs / POLL.activeMs; s++) {
      await vi.advanceTimersByTimeAsync(POLL.activeMs);
      expect(poller.feed()).toMatchObject({ status: "ready", fetchedAt: T0 });
      expect(poller.feed().snapshot).toEqual(good);
    }
    await vi.advanceTimersByTimeAsync(POLL.activeMs);
    expect(poller.feed().status).toBe("offline");
    expect(poller.feed().snapshot).toEqual(good);
  });

  it("treats 204, a non-200 status and an invalid body as errors, and { enabled: false } as disabled", async () => {
    for (const reply of [{ status: 204 }, { status: 503, body: {} }, { status: 200, body: { v: 9 } }] satisfies Reply[]) {
      const { fetcher } = fakeFetch([reply]);
      const poller = createOfficePoller({ fetcher });
      poller.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(poller.feed().status, JSON.stringify(reply)).toBe("offline");
      poller.stop();
    }
    const { fetcher } = fakeFetch([{ status: 200, body: OFFICE_FIXTURES.disabled }]);
    const poller = createOfficePoller({ fetcher });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.feed()).toMatchObject({ status: "disabled", snapshot: null });
  });

  it("stop() ends the timers but keeps the feed; start() fetches again at once; unsubscribe stops notifications", async () => {
    const { fetcher, calls } = fakeFetch([{ status: 200, body: statesA(T0) }]);
    const poller = createOfficePoller({ fetcher });
    const listener = vi.fn();
    const off = poller.subscribe(listener);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();
    await vi.advanceTimersByTimeAsync(POLL.restingMs * 3);
    expect(calls).toHaveLength(1);
    expect(poller.feed().status).toBe("ready");
    off();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
