import { describe, expect, it, vi } from "vitest";
import { createFloorChunks, floorMount, isLazyFloor, LAZY_FLOORS, rideChunkHold, speculativePrefetchOn } from "@/experience/floors/floorChunks";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(speculative = true) {
  const d = { L3: deferred<string>(), L4: deferred<string>(), RF: deferred<string>() };
  const calls = { L3: 0, L4: 0, RF: 0 };
  let clock = 100;
  const chunks = createFloorChunks(
    {
      L3: () => (calls.L3++, d.L3.promise),
      L4: () => (calls.L4++, d.L4.promise),
      RF: () => (calls.RF++, d.RF.promise),
    },
    { speculative: () => speculative, now: () => clock },
  );
  return { chunks, d, calls, tick: (ms: number) => (clock += ms) };
}

describe("floor chunks", () => {
  it("lists L3, L4 and RF as lazy; L1 and L2 are eager and always settled", () => {
    expect(LAZY_FLOORS).toEqual(["L3", "L4", "RF"]);
    expect(isLazyFloor("L1")).toBe(false);
    expect(isLazyFloor("L3")).toBe(true);
    const { chunks } = setup();
    expect(chunks.state("L1")).toBe("eager");
    expect(chunks.settled("L2")).toBe(true);
    expect(chunks.snapshot()).toEqual({ L1: "eager", L2: "eager", L3: "idle", L4: "idle", RF: "idle" });
  });

  it("loads once, records the request time and settles when the module arrives", async () => {
    const { chunks, d, calls } = setup();
    const a = chunks.load("L3");
    const b = chunks.load("L3");
    chunks.ensure("L3");
    expect(calls.L3).toBe(1);
    expect(chunks.state("L3")).toBe("loading");
    expect(chunks.settled("L3")).toBe(false);
    expect(chunks.requestedAt("L3")).toBe(100);
    d.L3.resolve("labs");
    await expect(a).resolves.toBe("labs");
    await expect(b).resolves.toBe("labs");
    expect(chunks.state("L3")).toBe("ready");
    expect(chunks.settled("L3")).toBe(true);
  });

  it("ignores eager floors in ensure and prefetch", () => {
    const { chunks, calls } = setup();
    chunks.ensure("L1");
    chunks.prefetch("L2");
    expect(calls).toEqual({ L3: 0, L4: 0, RF: 0 });
  });

  it("prefetches speculatively unless ?prefetch=off, but ensure always loads", () => {
    const off = setup(false);
    off.chunks.prefetchAll();
    off.chunks.prefetch("L4");
    expect(off.calls).toEqual({ L3: 0, L4: 0, RF: 0 });
    off.chunks.ensure("RF");
    expect(off.calls.RF).toBe(1);
    const on = setup(true);
    on.chunks.prefetchAll();
    expect(on.calls).toEqual({ L3: 1, L4: 1, RF: 1 });
  });

  it("marks a failed load settled (the crash path takes over) and retries on the next load", async () => {
    const { chunks, d, calls } = setup();
    const first = chunks.load("L4");
    d.L4.reject(new Error("offline"));
    await expect(first).rejects.toThrow("offline");
    expect(chunks.state("L4")).toBe("failed");
    expect(chunks.settled("L4")).toBe(true);
    d.L4 = deferred<string>();
    const again = chunks.load("L4");
    expect(calls.L4).toBe(2);
    expect(chunks.state("L4")).toBe("loading");
    d.L4.resolve("library");
    await expect(again).resolves.toBe("library");
  });

  it("swallows the rejection of a fire-and-forget ensure or prefetch", async () => {
    const { chunks, d } = setup();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    chunks.ensure("RF");
    d.RF.reject(new Error("offline"));
    await new Promise((r) => setTimeout(r, 0));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(chunks.state("RF")).toBe("failed");
  });

  it("reads ?prefetch=off", () => {
    expect(speculativePrefetchOn("")).toBe(true);
    expect(speculativePrefetchOn("?tier=lite")).toBe(true);
    expect(speculativePrefetchOn("?tier=lite&prefetch=off")).toBe(false);
  });

  describe("rideChunkHold", () => {
    it("starts one load when idle and holds while it loads", () => {
      const { chunks, calls } = setup();
      expect(rideChunkHold(chunks, "L3")).toBe(true);
      expect(calls.L3).toBe(1);
      expect(rideChunkHold(chunks, "L3")).toBe(true);
      expect(rideChunkHold(chunks, "L3")).toBe(true);
      expect(calls.L3).toBe(1);
    });

    it("releases after a failed load and never restarts it", async () => {
      const { chunks, d, calls } = setup();
      expect(rideChunkHold(chunks, "L4")).toBe(true);
      d.L4.reject(new Error("offline"));
      await new Promise((r) => setTimeout(r, 0));
      expect(chunks.state("L4")).toBe("failed");
      for (let i = 0; i < 5; i++) expect(rideChunkHold(chunks, "L4")).toBe(false);
      expect(calls.L4).toBe(1);
      expect(chunks.state("L4")).toBe("failed");
    });

    it("releases after success and for eager floors without loading", async () => {
      const { chunks, d, calls } = setup();
      rideChunkHold(chunks, "RF");
      d.RF.resolve("roof");
      await new Promise((r) => setTimeout(r, 0));
      expect(rideChunkHold(chunks, "RF")).toBe(false);
      expect(rideChunkHold(chunks, "L1")).toBe(false);
      expect(rideChunkHold(chunks, "L2")).toBe(false);
      expect(calls).toEqual({ L3: 0, L4: 0, RF: 1 });
    });
  });

  describe("floor mounting (no React.lazy retry for a loaded chunk)", () => {
    it("keeps the loaded module for a synchronous render, null before", async () => {
      const { chunks, d } = setup();
      expect(chunks.module("L3")).toBeNull();
      const load = chunks.load("L3");
      expect(chunks.module("L3")).toBeNull();
      d.L3.resolve("labs");
      await load;
      expect(chunks.module("L3")).toBe("labs");
    });

    it("notifies subscribers on every state change until they unsubscribe", async () => {
      const { chunks, d } = setup();
      const seen: string[] = [];
      const off = chunks.subscribe(() => seen.push(chunks.state("L4")));
      const first = chunks.load("L4");
      d.L4.reject(new Error("offline"));
      await first.catch(() => undefined);
      d.L4 = deferred<string>();
      const again = chunks.load("L4");
      d.L4.resolve("library");
      await again;
      expect(seen).toEqual(["loading", "failed", "loading", "ready"]);
      off();
      chunks.load("RF");
      expect(seen).toHaveLength(4);
    });

    it("renders eager floors as they are, a loaded chunk directly, nothing while it loads", async () => {
      const { chunks, d } = setup();
      expect(floorMount(chunks, "L1", false)).toBe("eager");
      expect(floorMount(chunks, "L2", false)).toBe("eager");
      expect(floorMount(chunks, "RF", false)).toBe("wait");
      const load = chunks.load("RF");
      expect(floorMount(chunks, "RF", false)).toBe("wait");
      d.RF.resolve("roof");
      await load;
      expect(floorMount(chunks, "RF", false)).toBe("module");
    });

    it("hands a failed floor to React.lazy, and keeps it there once a wrapper is in use", async () => {
      const { chunks, d } = setup();
      const first = chunks.load("L3");
      d.L3.reject(new Error("offline"));
      await first.catch(() => undefined);
      expect(chunks.hasFailed("L3")).toBe(true);
      expect(floorMount(chunks, "L3", false)).toBe("lazy");
      d.L3 = deferred<string>();
      const again = chunks.load("L3");
      expect(floorMount(chunks, "L3", true)).toBe("lazy");
      d.L3.resolve("labs");
      await again;
      expect(floorMount(chunks, "L3", true)).toBe("lazy");
      expect(chunks.hasFailed("L4")).toBe(false);
    });

    it("renders a recovered floor directly when no lazy wrapper was ever rendered", async () => {
      const { chunks, d } = setup();
      const first = chunks.load("L4");
      d.L4.reject(new Error("offline"));
      await first.catch(() => undefined);
      d.L4 = deferred<string>();
      const again = chunks.load("L4");
      expect(floorMount(chunks, "L4", false)).toBe("lazy");
      d.L4.resolve("library");
      await again;
      expect(floorMount(chunks, "L4", false)).toBe("module");
    });
  });
});
