import { describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { isMotionPref, resolveReducedMotion, storedMotion } from "@/lib/motion";
import { createHQStore, STORE_KEY } from "@/store/useHQStore";

function memoryStorage(initial?: Record<string, string>): StateStorage & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("resolveReducedMotion", () => {
  it("follows the system only under System", () => {
    expect(resolveReducedMotion("system", true)).toBe(true);
    expect(resolveReducedMotion("system", false)).toBe(false);
    expect(resolveReducedMotion("full", true)).toBe(false);
    expect(resolveReducedMotion("full", false)).toBe(false);
    expect(resolveReducedMotion("reduced", true)).toBe(true);
    expect(resolveReducedMotion("reduced", false)).toBe(true);
  });

  it("knows the three preferences", () => {
    expect(["system", "full", "reduced"].every(isMotionPref)).toBe(true);
    expect(isMotionPref("on")).toBe(false);
    expect(isMotionPref(undefined)).toBe(false);
  });
});

describe("storedMotion (head script)", () => {
  it("reads an override from the persisted store JSON", () => {
    expect(storedMotion(JSON.stringify({ state: { motion: "full" }, version: 2 }))).toBe("full");
    expect(storedMotion(JSON.stringify({ state: { motion: "reduced" }, version: 2 }))).toBe("reduced");
  });

  it("returns null under System, without a value or on garbage", () => {
    expect(storedMotion(JSON.stringify({ state: { motion: "system" }, version: 2 }))).toBeNull();
    expect(storedMotion(JSON.stringify({ state: { visited: [] }, version: 1 }))).toBeNull();
    expect(storedMotion("{not json")).toBeNull();
    expect(storedMotion("null")).toBeNull();
    expect(storedMotion(null)).toBeNull();
  });

  it("stays self-contained for the inline head script", () => {
    const inlined = new Function(`return (${storedMotion.toString()})`)() as typeof storedMotion;
    expect(inlined(JSON.stringify({ state: { motion: "full" } }))).toBe("full");
  });
});

describe("store motion preference", () => {
  it("defaults to System and resolves the OS flag", () => {
    const store = createHQStore(memoryStorage());
    expect(store.getState().motion).toBe("system");
    store.getState().setReducedMotion(true);
    expect(store.getState().systemReducedMotion).toBe(true);
    expect(store.getState().reducedMotion).toBe(true);
  });

  it("Full overrides an OS that asks for reduced motion, Reduced applies without it", () => {
    const store = createHQStore(memoryStorage());
    store.getState().setReducedMotion(true);
    store.getState().setMotion("full");
    expect(store.getState().reducedMotion).toBe(false);
    store.getState().setReducedMotion(false);
    store.getState().setMotion("reduced");
    expect(store.getState().reducedMotion).toBe(true);
    store.getState().setMotion("system");
    expect(store.getState().reducedMotion).toBe(false);
  });

  it("persists the preference (version 2) and restores it on the next load", () => {
    const storage = memoryStorage();
    createHQStore(storage).getState().setMotion("full");
    const saved = JSON.parse(storage.data.get(STORE_KEY)!);
    expect(saved.version).toBe(2);
    expect(saved.state.motion).toBe("full");
    const again = createHQStore(storage);
    again.getState().setReducedMotion(true);
    expect(again.getState().motion).toBe("full");
    expect(again.getState().reducedMotion).toBe(false);
  });

  it("migrates a version 1 payload to System and keeps its keys", () => {
    const v1 = JSON.stringify({ state: { visited: ["L3:a"], firstVisit: false, locale: "id" }, version: 1 });
    const store = createHQStore(memoryStorage({ [STORE_KEY]: v1 }));
    expect(store.getState().motion).toBe("system");
    expect(store.getState().visited).toEqual(["L3:a"]);
    expect(store.getState().firstVisit).toBe(false);
    expect(store.getState().locale).toBe("id");
  });

  it("falls back to System on an unknown stored value", () => {
    const bad = JSON.stringify({ state: { visited: [], firstVisit: true, locale: "en", motion: "wild" }, version: 2 });
    const store = createHQStore(memoryStorage({ [STORE_KEY]: bad }));
    expect(store.getState().motion).toBe("system");
  });
});
