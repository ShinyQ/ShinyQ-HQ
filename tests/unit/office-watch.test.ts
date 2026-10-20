// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OFFICE_PATH } from "@/lib/office/protocol";
import { getHQStore } from "@/store/useHQStore";
import { officeSignal, setOfficeSignal } from "@/experience/floors/lobby/office/officeSignal";
import { officeWatchTick, startOfficeWatch } from "@/experience/floors/lobby/office/officeWatch";

const body = (state: string) => ({ v: 1, enabled: true, mode: "live", updatedAt: 1, desks: [{ slot: 2, state }], extra: 0, github: [], today: {} });
const fetcher = (state: string) => vi.fn(async () => new Response(JSON.stringify(body(state)), { status: 200 }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setOfficeSignal({ needsKurniadi: false, asking: [], deployAt: null, sceneFeeding: false, goodAt: 0 });
});

describe("office watch", () => {
  it("polls every 30 s on L1 and raises needsKurniadi", async () => {
    vi.useFakeTimers();
    getHQStore().setState({ floor: "L1", ride: null });
    const f = fetcher("input");
    const stop = startOfficeWatch({ fetch: f, now: () => Date.now(), every: 30_000 });
    await vi.advanceTimersByTimeAsync(10);
    expect(officeSignal.needsKurniadi).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f).toHaveBeenCalledTimes(2);
    stop();
  });
  it("does not fetch off L1, while the scene feeds, or with a hidden tab", async () => {
    vi.useFakeTimers();
    const f = fetcher("input");
    getHQStore().setState({ floor: "L2", ride: null });
    const stop = startOfficeWatch({ fetch: f, now: () => Date.now(), every: 30_000 });
    await vi.advanceTimersByTimeAsync(31_000);
    getHQStore().setState({ floor: "L1" });
    setOfficeSignal({ sceneFeeding: true });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(f).not.toHaveBeenCalled();
    setOfficeSignal({ sceneFeeding: false });
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await vi.advanceTimersByTimeAsync(31_000);
    expect(f).not.toHaveBeenCalled();
    // Visibility is read at tick time: the next tick after the tab turns visible fetches.
    visibility.mockReturnValue("visible");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f).toHaveBeenCalledTimes(1);
    stop();
  });
  it("does not fetch while riding, nor after 10 min without input, and input brings it back", async () => {
    vi.useFakeTimers();
    getHQStore().setState({ floor: "L1", ride: { from: "L2", to: "L1" } as never });
    const f = fetcher("working");
    const stop = startOfficeWatch({ fetch: f, now: () => Date.now(), every: 30_000 });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(f).not.toHaveBeenCalled();
    getHQStore().setState({ ride: null });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const calls = f.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f).toHaveBeenCalledTimes(calls);
    window.dispatchEvent(new Event("keydown"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f).toHaveBeenCalledTimes(calls + 1);
    stop();
  });
  it("clears the beacon after 60 s without a good answer", async () => {
    vi.useFakeTimers();
    getHQStore().setState({ floor: "L1", ride: null });
    let ok = true;
    const f = vi.fn(async () => (ok ? new Response(JSON.stringify(body("input"))) : new Response("x", { status: 500 })));
    const stop = startOfficeWatch({ fetch: f, now: () => Date.now(), every: 30_000 });
    await vi.advanceTimersByTimeAsync(10);
    ok = false;
    await vi.advanceTimersByTimeAsync(61_000);
    expect(officeSignal.needsKurniadi).toBe(false);
    stop();
  });
  it("clears 60 s after the last good answer even when it stops fetching (left L1) or the answer came from the scene", async () => {
    vi.useFakeTimers();
    getHQStore().setState({ floor: "L1", ride: null });
    const stop = startOfficeWatch({ fetch: fetcher("input"), now: () => Date.now(), every: 30_000 });
    await vi.advanceTimersByTimeAsync(10);
    getHQStore().setState({ floor: "L3" });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(officeSignal.needsKurniadi).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(officeSignal.needsKurniadi).toBe(false);
    // The scene's feed: its own goodAt, the same window.
    setOfficeSignal({ sceneFeeding: true, asking: [4], goodAt: Date.now() - 30_000 });
    await vi.advanceTimersByTimeAsync(29_000);
    expect(officeSignal.asking).toEqual([4]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(officeSignal.asking).toEqual([]);
    stop();
  });
  it("clears the beacon at once when stopped (the Lobby unmounts on a ride off L1)", async () => {
    vi.useFakeTimers();
    getHQStore().setState({ floor: "L1", ride: null });
    const stop = startOfficeWatch({ fetch: fetcher("input"), now: () => Date.now(), every: 30_000 });
    await vi.advanceTimersByTimeAsync(10);
    setOfficeSignal({ deployAt: Date.now() });
    expect(officeSignal.needsKurniadi).toBe(true);
    stop();
    expect(officeSignal).toMatchObject({ needsKurniadi: false, asking: [], deployAt: null });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("never throws on hostile bodies and keeps no text from them", async () => {
    vi.useFakeTimers();
    getHQStore().setState({ floor: "L1", ride: null });
    const bodies: (() => Response | Promise<Response>)[] = [
      () => new Response("<script>alert(1)</script>"),
      () => new Response("null"),
      () => new Response(JSON.stringify({ v: 1, enabled: true, desks: [{ slot: "<b>", state: "input" }], github: [] })),
      () => new Response(JSON.stringify({ v: 1, enabled: true, desks: [{ slot: 1, state: "input", title: "<img src=x>" }], github: [{ kind: "deploy", status: "success", at: "x", title: "<i>" }] })),
      () => new Response(null, { status: 204 }),
      () => Promise.reject(new TypeError("offline")),
    ];
    let i = 0;
    const f = vi.fn(async () => bodies[i++]());
    const stop = startOfficeWatch({ fetch: f, now: () => Date.now(), every: 1_000 });
    await vi.advanceTimersByTimeAsync((bodies.length - 1) * 1_000);
    expect(f).toHaveBeenCalledTimes(bodies.length);
    expect(officeSignal.asking).toEqual([1]);
    expect(JSON.stringify(officeSignal)).not.toMatch(/[<>]/);
    stop();
  });
  it("applies only the newest answer and nothing after stop", async () => {
    vi.useFakeTimers();
    getHQStore().setState({ floor: "L1", ride: null });
    const pending: ((r: Response) => void)[] = [];
    const f = vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));
    const stop = startOfficeWatch({ fetch: f, now: () => Date.now(), every: 30_000 });
    await vi.advanceTimersByTimeAsync(30_010);
    expect(pending).toHaveLength(2);
    pending[1](new Response(JSON.stringify(body("working"))));
    await vi.advanceTimersByTimeAsync(1);
    pending[0](new Response(JSON.stringify(body("input"))));
    await vi.advanceTimersByTimeAsync(1);
    expect(officeSignal.needsKurniadi).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    stop();
    pending[2](new Response(JSON.stringify(body("input"))));
    await vi.advanceTimersByTimeAsync(1);
    expect(officeSignal.needsKurniadi).toBe(false);
  });
  it("runs one tick now through officeWatchTick (the __hq.office.watchNow test hook)", async () => {
    getHQStore().setState({ floor: "L1", ride: null });
    await expect(officeWatchTick()).resolves.toBeUndefined();
    let state = "input";
    const f = vi.fn(async () => new Response(JSON.stringify(body(state))));
    const stop = startOfficeWatch({ fetch: f, every: 60_000 });
    await officeWatchTick();
    expect(officeSignal.needsKurniadi).toBe(true);
    state = "working";
    await officeWatchTick();
    expect(officeSignal.needsKurniadi).toBe(false);
    const calls = f.mock.calls.length;
    stop();
    await officeWatchTick();
    expect(f).toHaveBeenCalledTimes(calls);
  });
  it("bypasses the HTTP cache (the endpoint allows max-age=5 plus stale-while-revalidate=30)", async () => {
    getHQStore().setState({ floor: "L1", ride: null });
    const f = fetcher("input");
    const stop = startOfficeWatch({ fetch: f, every: 60_000 });
    await officeWatchTick();
    expect(f).toHaveBeenCalled();
    for (const call of f.mock.calls as unknown[][]) expect((call[1] as RequestInit | undefined)?.cache).toBe("no-store");
    stop();
  });
  it("fetches the protocol path and keeps the watch chunk modules free of the protocol, the content schema and zod", () => {
    const f = fetcher("asleep");
    getHQStore().setState({ floor: "L1", ride: null });
    const stop = startOfficeWatch({ fetch: f, every: 60_000 });
    return officeWatchTick().then(() => {
      expect(f.mock.calls[0]).toEqual([OFFICE_PATH, expect.objectContaining({ credentials: "omit" })]);
      stop();
      for (const file of ["officeSignal.ts", "officeWatch.ts"]) {
        const text = readFileSync(join(process.cwd(), "src/experience/floors/lobby/office", file), "utf8");
        expect(text.match(/^import .* from "([^"]+)";$/gm)?.map((l) => l.replace(/.* from /, ""))).toEqual(file === "officeSignal.ts" ? ['"react";'] : ['"@/store/useHQStore";', '"./officeSignal";']);
      }
    });
  });
});
