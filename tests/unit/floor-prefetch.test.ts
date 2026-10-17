import { describe, expect, it } from "vitest";
import { prefetchFor, rideRetry } from "@/experience/floors/floorPrefetch";

const idle = { ride: null, picker: null, hover: null };

describe("floor chunk prefetch triggers", () => {
  it("needs the ride target at once", () => {
    expect(prefetchFor({ ...idle, ride: { to: "L4" } })).toEqual({ need: ["L4"], soon: [] });
  });

  it("prefetches every lazy floor when the floor picker opens or a call pad is targeted", () => {
    expect(prefetchFor({ ...idle, picker: { kind: "floor" } })).toEqual({ need: [], soon: ["L3", "L4", "RF"] });
    expect(prefetchFor({ ...idle, hover: { item: { kind: "elevator-pad" } } })).toEqual({ need: [], soon: ["L3", "L4", "RF"] });
  });

  it("ignores year pickers, the time console and other targets", () => {
    expect(prefetchFor({ ...idle, picker: { kind: "year" } })).toEqual({ need: [], soon: [] });
    expect(prefetchFor({ ...idle, picker: { kind: "console" } })).toEqual({ need: [], soon: [] });
    expect(prefetchFor({ ...idle, hover: { item: { kind: "door" } } })).toEqual({ need: [], soon: [] });
    expect(prefetchFor(idle)).toEqual({ need: [], soon: [] });
  });

  it("adds B1 to the picker and call pad prefetch, and to the idle prefetch, only once unlocked", () => {
    expect(prefetchFor({ ...idle, picker: { kind: "floor" }, b1Unlocked: true })).toEqual({ need: [], soon: ["L3", "L4", "RF", "B1"] });
    expect(prefetchFor({ ...idle, b1Unlocked: true })).toEqual({ need: [], soon: [] });
    expect(prefetchFor({ ...idle, b1Unlocked: true, idle: true })).toEqual({ need: [], soon: ["B1"] });
    expect(prefetchFor({ ...idle, idle: true })).toEqual({ need: [], soon: [] });
  });
});

describe("failed chunk retry at ride start", () => {
  const ride = { from: "L1", to: "L3" } as const;

  it("retries a failed target once when a ride appears", () => {
    const first = rideRetry(null, ride, "failed");
    expect(first).toEqual({ key: "L1->L3", retry: "L3" });
    // later store changes of the same ride (stages, doors) never retry again
    expect(rideRetry(first.key, ride, "failed")).toEqual({ key: "L1->L3", retry: null });
  });

  it("retries again for the next ride, or for a retargeted one", () => {
    const done = rideRetry("L1->L3", null, "failed");
    expect(done).toEqual({ key: null, retry: null });
    expect(rideRetry(done.key, ride, "failed").retry).toBe("L3");
    expect(rideRetry("L1->L3", { from: "L1", to: "L4" }, "failed")).toEqual({ key: "L1->L4", retry: "L4" });
  });

  it("leaves idle, loading, ready and eager targets alone", () => {
    for (const state of ["idle", "loading", "ready", "eager"] as const) expect(rideRetry(null, ride, state).retry).toBeNull();
  });
});
