// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHQStore } from "@/store/useHQStore";

const beaconImports = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/experience/floors/lobby/office/beaconChunk", () => {
  beaconImports.n += 1;
  return { OfficeBeacon: () => null };
});

type Loader = typeof import("@/experience/floors/lobby/office/watchLoader");
type Signal = typeof import("@/experience/floors/lobby/office/officeSignal");

const body = (state: string) => ({ v: 1, enabled: true, mode: "live", updatedAt: 1, desks: [{ slot: 2, state }], extra: 0, github: [], today: {} });

afterEach(() => {
  vi.doUnmock("@/experience/floors/lobby/office/watchLoader");
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("office watch loader", () => {
  it("loads the beacon chunk once (one shared promise) and exposes it through useOfficeBeaconModule", async () => {
    const loader: Loader = await import("@/experience/floors/lobby/office/watchLoader");
    const hook = renderHook(() => loader.useOfficeBeaconModule());
    expect(hook.result.current).toBeNull();
    const before = beaconImports.n;
    const a = loader.loadOfficeBeacon();
    expect(loader.loadOfficeBeacon()).toBe(a);
    await act(async () => {
      await a;
    });
    expect(beaconImports.n - before).toBe(1);
    expect(hook.result.current?.OfficeBeacon).toBeTypeOf("function");
    expect(loader.loadOfficeBeacon()).toBe(a);
  });

  it("loads the watch chunk once and exposes it through useOfficeWatchModule", async () => {
    const loader: Loader = await import("@/experience/floors/lobby/office/watchLoader");
    const hook = renderHook(() => loader.useOfficeWatchModule());
    expect(hook.result.current).toBeNull();
    const a = loader.loadOfficeWatch();
    expect(loader.loadOfficeWatch()).toBe(a);
    await act(async () => {
      await a;
    });
    expect(Object.keys(hook.result.current ?? {}).sort()).toEqual(["OfficeCue", "officeWatchTick", "startOfficeWatch"]);
  });

  it("useOfficeAsks follows setOfficeAsks", async () => {
    const loader: Loader = await import("@/experience/floors/lobby/office/watchLoader");
    const hook = renderHook(() => loader.useOfficeAsks());
    expect(hook.result.current).toBe(false);
    act(() => loader.setOfficeAsks(true));
    expect(hook.result.current).toBe(true);
    expect(loader.officeAsks.on).toBe(true);
    act(() => loader.setOfficeAsks(false));
    expect(hook.result.current).toBe(false);
  });

  it("the watch chunk mirrors the signal and loads the beacon once on the first ask, never on a quiet feed", async () => {
    const load = vi.fn<() => Promise<unknown>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({});
    vi.doMock("@/experience/floors/lobby/office/watchLoader", async (orig) => ({ ...(await orig<Loader>()), loadOfficeBeacon: load }));
    const loader: Loader = await import("@/experience/floors/lobby/office/watchLoader");
    const signal: Signal = await import("@/experience/floors/lobby/office/officeSignal");
    await import("@/experience/floors/lobby/office/watchChunk");
    signal.setOfficeSignal({ asking: [], deployAt: null, goodAt: Date.now() });
    signal.setOfficeSignal({ asking: [], deployAt: null, goodAt: Date.now() });
    expect(load).not.toHaveBeenCalled();
    expect(loader.officeAsks.on).toBe(false);
    // A failed first load retries on the next ask.
    signal.setOfficeSignal({ asking: [1], goodAt: Date.now() });
    expect(loader.officeAsks.on).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    signal.setOfficeSignal({ asking: [1, 2], goodAt: Date.now() });
    expect(load).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    signal.setOfficeSignal({ asking: [], goodAt: Date.now() });
    expect(loader.officeAsks.on).toBe(false);
    signal.setOfficeSignal({ asking: [3], goodAt: Date.now() });
    expect(load).toHaveBeenCalledTimes(2);
    signal.setOfficeSignal({ asking: [], goodAt: Date.now() });
  });

  it("the watch chunk loads the beacon once on a fresh deploy with nobody asking (the beam), without raising the minimap's label", async () => {
    const load = vi.fn(() => Promise.resolve({}));
    vi.doMock("@/experience/floors/lobby/office/watchLoader", async (orig) => ({ ...(await orig<Loader>()), loadOfficeBeacon: load }));
    const loader: Loader = await import("@/experience/floors/lobby/office/watchLoader");
    const signal: Signal = await import("@/experience/floors/lobby/office/officeSignal");
    await import("@/experience/floors/lobby/office/watchChunk");
    signal.setOfficeSignal({ asking: [], deployAt: null, goodAt: Date.now() });
    expect(load).not.toHaveBeenCalled();
    signal.setOfficeSignal({ asking: [], deployAt: Date.now(), goodAt: Date.now() });
    expect(load).toHaveBeenCalledTimes(1);
    expect(loader.officeAsks.on).toBe(false);
    await Promise.resolve();
    signal.setOfficeSignal({ asking: [], deployAt: Date.now() + 1, goodAt: Date.now() });
    signal.setOfficeSignal({ asking: [2], goodAt: Date.now() });
    expect(load).toHaveBeenCalledTimes(1);
    signal.setOfficeSignal({ asking: [], deployAt: null, goodAt: Date.now() });
  });

  it("mirrors a signal the scene fed before the watch chunk loaded", async () => {
    const load = vi.fn(() => Promise.resolve({}));
    vi.doMock("@/experience/floors/lobby/office/watchLoader", async (orig) => ({ ...(await orig<Loader>()), loadOfficeBeacon: load }));
    const loader: Loader = await import("@/experience/floors/lobby/office/watchLoader");
    const signal: Signal = await import("@/experience/floors/lobby/office/officeSignal");
    signal.setOfficeSignal({ asking: [0], goodAt: Date.now() });
    await import("@/experience/floors/lobby/office/watchChunk");
    expect(loader.officeAsks.on).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    signal.setOfficeSignal({ asking: [], goodAt: Date.now() });
  });

  it("officeWatchNow called before any watch exists waits for the OfficeMount effect to start one, then ticks", async () => {
    const loader: Loader = await import("@/experience/floors/lobby/office/watchLoader");
    const signal: Signal = await import("@/experience/floors/lobby/office/officeSignal");
    getHQStore().setState({ floor: "L1", ride: null });
    const f = vi.fn(async () => new Response(JSON.stringify(body("input")), { status: 200 }));
    let done = false;
    // The call that loads the chunk (`?prefetch=off`): no watch runs yet.
    const now = loader.officeWatchNow().then(() => {
      done = true;
    });
    const watch = await loader.loadOfficeWatch();
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toBe(false);
    expect(f).not.toHaveBeenCalled();
    // A simulated OfficeMount effect starts the watch once the module arrived (after React commits).
    const stop = watch.startOfficeWatch({ fetch: f, every: 60_000 });
    await now;
    expect(f).toHaveBeenCalledTimes(2);
    expect(signal.officeSignal.needsKurniadi).toBe(true);
    expect(loader.officeAsks.on).toBe(true);
    const calls = f.mock.calls.length;
    await loader.officeWatchNow();
    expect(f).toHaveBeenCalledTimes(calls + 1);
    stop();
    expect(signal.officeSignal.needsKurniadi).toBe(false);
  });
});
