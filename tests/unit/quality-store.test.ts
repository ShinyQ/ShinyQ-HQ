import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { qualityStore } from "@/experience/scene/qualityStore";

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal("window", {});
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) });
  qualityStore.reset();
});
afterEach(() => vi.unstubAllGlobals());

it("starts at level 0 and remembers the level for the session", () => {
  expect(qualityStore.get()).toEqual({ level: 0, locked: false, flips: 0, last: null });
  qualityStore.set({ level: 2, locked: true, flips: 2, last: "down" });
  expect(JSON.parse(storage.get("hq:gfx")!)).toEqual({ level: 2, locked: true });
  qualityStore.reset();
  expect(qualityStore.get()).toEqual({ level: 2, locked: true, flips: 0, last: null });
});

it("ignores a corrupt stored value", () => {
  storage.set("hq:gfx", "{nope");
  expect(qualityStore.get().level).toBe(0);
  storage.set("hq:gfx", JSON.stringify({ level: 99 }));
  qualityStore.reset();
  expect(qualityStore.get().level).toBe(0);
});

it("notifies subscribers on level and applied-DPR changes only", () => {
  const listener = vi.fn();
  const off = qualityStore.subscribe(listener);
  qualityStore.set({ level: 1, locked: false, flips: 1, last: "down" });
  qualityStore.setApplied({ level: 1, dpr: 1.7, multisampling: 0, bloomLevels: 8 });
  qualityStore.setApplied({ level: 1, dpr: 1.7, multisampling: 0, bloomLevels: 8 });
  expect(listener).toHaveBeenCalledTimes(2);
  expect(qualityStore.applied()?.dpr).toBe(1.7);
  off();
});
