import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFFICE_FIXTURES, OFFICE_FIXTURES_V2 } from "@/lib/office/fixtures";
import { createOfficePoller, POLL, pollInterval, type OfficeFeed } from "@/lib/office/poll";
import { OFFICE_PATH, parseOfficeResponseV2 } from "@/lib/office/protocol";
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
    expect(calls[0].init).toEqual({ headers: { accept: "application/json" }, credentials: "omit", signal: expect.any(AbortSignal) });
    expect(poller.feed()).toMatchObject({ status: "ready", fetchedAt: T0 });
    expect(seen.map((f) => f.status)).toEqual(["loading", "ready"]);
    await vi.advanceTimersByTimeAsync(POLL.activeMs);
    expect(calls).toHaveLength(2);
  });

  it("fetches its path and parses with its parse (v2 with helpers; v1 rejects a v2 body)", async () => {
    const v2 = fakeFetch([{ status: 200, body: OFFICE_FIXTURES_V2.busy }]);
    const poller = createOfficePoller({ fetcher: v2.fetcher, path: `${OFFICE_PATH}?v=2`, parse: parseOfficeResponseV2 });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(v2.calls[0].url).toBe("/api/office?v=2");
    expect(poller.feed()).toMatchObject({ status: "ready", snapshot: OFFICE_FIXTURES_V2.busy });
    poller.stop();
    const parse = vi.fn(() => null);
    const custom = fakeFetch([{ status: 200, body: OFFICE_FIXTURES.busy }]);
    const rejecting = createOfficePoller({ fetcher: custom.fetcher, path: "/x", parse });
    rejecting.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(custom.calls[0].url).toBe("/x");
    expect(parse).toHaveBeenCalledWith(OFFICE_FIXTURES.busy);
    expect(rejecting.feed().status).toBe("offline");
    rejecting.stop();
    const v1 = fakeFetch([{ status: 200, body: OFFICE_FIXTURES_V2.busy }]);
    const plain = createOfficePoller({ fetcher: v1.fetcher });
    plain.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(v1.calls[0].url).toBe(OFFICE_PATH);
    expect(plain.feed().status).toBe("offline");
    plain.stop();
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

describe("createOfficePoller robustness", () => {
  /** A fetch stand-in whose calls stay pending until the test resolves them; it rejects when its signal aborts. */
  function deferredFetch() {
    const pending: { resolve: (r: Reply) => void; signal?: AbortSignal | null }[] = [];
    const fetcher = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          pending.push({
            signal: init?.signal,
            resolve: (r) => resolve({ status: r.status, json: async () => r.body ?? null } as unknown as Response),
          });
        }),
    );
    return { fetcher: fetcher as unknown as typeof fetch, pending };
  }

  it("drops a result that lands after stop() and keeps the newer snapshot across stop() then start()", async () => {
    const pending: ((r: Reply) => void)[] = [];
    // This stand-in ignores the abort signal, so a late answer from the first request really lands.
    const fetcher = vi.fn(
      () => new Promise<Response>((resolve) => pending.push((r) => resolve({ status: r.status, json: async () => r.body ?? null } as unknown as Response))),
    ) as unknown as typeof fetch;
    const poller = createOfficePoller({ fetcher });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    const listener = vi.fn();
    poller.subscribe(listener);
    poller.stop();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(pending).toHaveLength(2);
    const older = statesA(T0 - 5_000);
    const newer = asleep(T0);
    pending[1]({ status: 200, body: newer });
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.feed().snapshot).toEqual(newer);
    expect(listener).toHaveBeenCalledTimes(1);
    pending[0]({ status: 200, body: older });
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.feed().snapshot).toEqual(newer);
    expect(listener).toHaveBeenCalledTimes(1);
    poller.stop();
    listener.mockClear();
    await vi.advanceTimersByTimeAsync(POLL.restingMs * 2);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stop() aborts the request in flight and no listener fires after it", async () => {
    const { fetcher, pending } = deferredFetch();
    const poller = createOfficePoller({ fetcher });
    const listener = vi.fn();
    poller.subscribe(listener);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    listener.mockClear();
    poller.stop();
    expect(pending[0].signal?.aborted).toBe(true);
    pending[0].resolve({ status: 200, body: statesA(T0) });
    await vi.advanceTimersByTimeAsync(POLL.restingMs);
    expect(listener).not.toHaveBeenCalled();
    expect(poller.feed().status).toBe("loading");
  });

  it("aborts a hung request after 10 s and follows the error path", async () => {
    const { fetcher, pending } = deferredFetch();
    const poller = createOfficePoller({ fetcher });
    poller.start();
    await vi.advanceTimersByTimeAsync(POLL.activeMs - 1);
    expect(poller.feed().status).toBe("loading");
    await vi.advanceTimersByTimeAsync(1);
    expect(pending[0].signal?.aborted).toBe(true);
    expect(poller.feed().status).toBe("offline");
    await vi.advanceTimersByTimeAsync(POLL.restingMs);
    expect(pending).toHaveLength(2);
  });

  it("keeps polling when a listener throws", async () => {
    const { fetcher, calls } = fakeFetch([{ status: 200, body: statesA(T0) }]);
    const poller = createOfficePoller({ fetcher });
    const after = vi.fn();
    poller.subscribe(() => {
      throw new Error("listener failed");
    });
    poller.subscribe(after);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.feed().status).toBe("ready");
    await vi.advanceTimersByTimeAsync(POLL.activeMs);
    expect(calls).toHaveLength(2);
    expect(after).toHaveBeenCalledTimes(3);
  });
});
