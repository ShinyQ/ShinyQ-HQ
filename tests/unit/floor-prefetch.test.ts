import { describe, expect, it } from "vitest";
import { prefetchFor } from "@/experience/floors/floorPrefetch";

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
});
