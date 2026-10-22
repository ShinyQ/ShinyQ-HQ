import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactorLive, reactorLive, reactorTest, useReactorFeed } from "@/experience/floors/engine/reactorLive";
import { OFFICE_FIXTURES_V4 } from "@/lib/office/fixtures";
import { OFFICE_V4_PATH, POLL } from "@/lib/office/poll";

const T0 = 1_800_000_000_000;
const INPUT = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/** An event target that counts its live listeners, so a test can prove every one was removed. */
class FakeTarget extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
  readonly live = new Map<string, number>();
  readonly options: { type: string; options: unknown }[] = [];
  override addEventListener(type: string, fn: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
    this.live.set(type, (this.live.get(type) ?? 0) + 1);
    this.options.push({ type, options });
    super.addEventListener(type, fn, options);
  }
  override removeEventListener(type: string, fn: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void {
    this.live.set(type, (this.live.get(type) ?? 0) - 1);
    super.removeEventListener(type, fn, options);
  }
  count(): number {
    return [...this.live.values()].reduce((a, b) => a + b, 0);
  }
}

/** A fetch stand-in: answers 200 with a v4 body, or hangs until aborted when `hang` is set. */
function fakeFetch(opts: { hang?: boolean } = {}) {
  const calls: { url: string; signal: AbortSignal }[] = [];
  const fetcher = vi.fn(
    (url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init!.signal!;
        calls.push({ url: String(url), signal });
        if (opts.hang) {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          return;
        }
        resolve({ status: 200, json: async () => OFFICE_FIXTURES_V4.quiet } as unknown as Response);
      }),
  );
  return { fetcher: fetcher as unknown as typeof fetch, calls };
}

function setup(opts: { hang?: boolean } = {}) {
  const win = new FakeTarget();
  const doc = new FakeTarget();
  const { fetcher, calls } = fakeFetch(opts);
  const requestStats = vi.fn();
  const live = createReactorLive({ fetcher, requestStats, win, doc, visible: () => doc.visibilityState === "visible" });
  return { win, doc, calls, requestStats, live };
}

beforeEach(() => vi.useFakeTimers({ now: T0 }));
afterEach(() => vi.useRealTimers());

describe("B1 reactor poller", () => {
  it("makes no request and attaches no listener before start", async () => {
    const { win, doc, calls, requestStats, live } = setup();
    await vi.advanceTimersByTimeAsync(POLL.restingMs * 3);
    expect(calls).toHaveLength(0);
    expect(requestStats).not.toHaveBeenCalled();
    expect(win.count() + doc.count()).toBe(0);
    expect(live.started()).toBe(false);
    expect(live.feed().status).toBe("idle");
  });

  it("start fetches /api/office?v=4 once, asks the stats once and listens for input and visibility", async () => {
    const { win, doc, calls, requestStats, live } = setup();
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map((c) => c.url)).toEqual([OFFICE_V4_PATH]);
    expect(requestStats).toHaveBeenCalledTimes(1);
    expect(live.started()).toBe(true);
    expect(live.feed()).toMatchObject({ status: "ready", fetchedAt: T0 });
    for (const type of INPUT) expect(win.live.get(type), type).toBe(1);
    expect(win.options.every((o) => (o.options as AddEventListenerOptions).passive === true)).toBe(true);
    expect(doc.live.get("visibilitychange")).toBe(1);
    live.stop();
  });

  it("a second start is a no-op (no second request, listener or stats call)", async () => {
    const { win, doc, calls, requestStats, live } = setup();
    live.start();
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect(requestStats).toHaveBeenCalledTimes(1);
    expect(win.count()).toBe(INPUT.length);
    expect(doc.count()).toBe(1);
    live.stop();
  });

  it("asks the stats once per page load across stop and start", async () => {
    const { requestStats, live } = setup();
    live.start();
    live.stop();
    live.start();
    expect(requestStats).toHaveBeenCalledTimes(1);
    live.stop();
  });

  it("stop aborts the request in flight and removes every listener", async () => {
    const { win, doc, calls, live } = setup({ hang: true });
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].signal.aborted).toBe(false);
    live.stop();
    expect(calls[0].signal.aborted).toBe(true);
    expect(live.started()).toBe(false);
    expect(win.count()).toBe(0);
    expect(doc.count()).toBe(0);
    await vi.advanceTimersByTimeAsync(POLL.restingMs * 3);
    expect(calls).toHaveLength(1);
  });

  it("stops after 10 min without input, and input restarts it", async () => {
    const { win, calls, live } = setup();
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL.idleStopMs + POLL.restingMs * 2);
    const before = calls.length;
    expect(before).toBeGreaterThanOrEqual(Math.floor(POLL.idleStopMs / POLL.restingMs));
    await vi.advanceTimersByTimeAsync(POLL.restingMs * 4);
    expect(calls).toHaveLength(before);
    win.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(before + 1);
    live.stop();
  });

  it("the tab turning visible fetches at once while started, and does nothing while stopped", async () => {
    const { doc, calls, live } = setup();
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(1_000);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    live.stop();
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(POLL.restingMs * 2);
    expect(calls).toHaveLength(2);
  });

  it("the test hook polls once while stopped, advances the clock and counts settled fetches", async () => {
    const { calls, live } = setup();
    const test = live.test;
    expect(test.settled()).toBe(0);
    test.poll();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map((c) => c.url)).toEqual([OFFICE_V4_PATH]);
    expect(test.feed().status).toBe("ready");
    expect(test.settled()).toBe(1);
    expect(test.started()).toBe(false);
    await vi.advanceTimersByTimeAsync(POLL.restingMs * 3);
    expect(calls).toHaveLength(1);
    test.advance(90_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(test.feed().fetchedAt).toBe(T0 + POLL.restingMs * 3 + 90_000);
    expect(live.now()).toBe(Date.now() + 90_000);
  });

  it("exports an app singleton that has not started, its test hook and the feed hook", () => {
    expect(reactorLive.started()).toBe(false);
    expect(reactorLive.feed().status).toBe("idle");
    expect(reactorTest).toBe(reactorLive.test);
    expect(typeof useReactorFeed).toBe("function");
  });
});
