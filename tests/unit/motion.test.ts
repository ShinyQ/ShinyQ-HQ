import { describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { DEFAULT_MOTION, isMotionPref, migrateMotion, resolveReducedMotion, storedMotion } from "@/lib/motion";
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

describe("migrateMotion", () => {
  it("turns the old default System into Full, keeps Reduced and Full", () => {
    expect(migrateMotion("system", 2)).toBe("full");
    expect(migrateMotion("reduced", 2)).toBe("reduced");
    expect(migrateMotion("full", 2)).toBe("full");
    expect(migrateMotion(undefined, 1)).toBe("full");
    expect(migrateMotion("wild", 2)).toBe("full");
  });

  it("keeps a System picked once Full became the default", () => {
    expect(migrateMotion("system", 3)).toBe("system");
  });
});

describe("storedMotion (head script)", () => {
  it("reads an override from the persisted store JSON", () => {
    expect(storedMotion(JSON.stringify({ state: { motion: "full" }, version: 3 }))).toBe("full");
    expect(storedMotion(JSON.stringify({ state: { motion: "reduced" }, version: 3 }))).toBe("reduced");
    expect(storedMotion(JSON.stringify({ state: { motion: "reduced" }, version: 2 }))).toBe("reduced");
  });

  it("is Full for a new visitor, the old default System, a missing value or garbage", () => {
    expect(storedMotion(null)).toBe("full");
    expect(storedMotion(JSON.stringify({ state: { motion: "system" }, version: 2 }))).toBe("full");
    expect(storedMotion(JSON.stringify({ state: { visited: [] }, version: 1 }))).toBe("full");
    expect(storedMotion(JSON.stringify({ state: { motion: "wild" }, version: 3 }))).toBe("full");
    expect(storedMotion("{not json")).toBe("full");
    expect(storedMotion("null")).toBe("full");
  });

  it("returns null only under a System picked from version 3 on", () => {
    expect(storedMotion(JSON.stringify({ state: { motion: "system" }, version: 3 }))).toBeNull();
  });

  it("stays self-contained for the inline head script", () => {
    const inlined = new Function(`return (${storedMotion.toString()})`)() as typeof storedMotion;
    expect(inlined(JSON.stringify({ state: { motion: "reduced" } }))).toBe("reduced");
    expect(inlined(JSON.stringify({ state: { motion: "system" }, version: 3 }))).toBeNull();
    expect(inlined(null)).toBe("full");
  });
});

describe("store motion preference", () => {
  it("defaults to Full on every OS (owner decision 2026-10-14)", () => {
    const store = createHQStore(memoryStorage());
    expect(store.getState().motion).toBe(DEFAULT_MOTION);
    expect(DEFAULT_MOTION).toBe("full");
    store.getState().setReducedMotion(true);
    expect(store.getState().systemReducedMotion).toBe(true);
    expect(store.getState().reducedMotion).toBe(false);
  });

  it("System follows the OS flag, Full overrides it, Reduced applies without it", () => {
    const store = createHQStore(memoryStorage());
    store.getState().setReducedMotion(true);
    store.getState().setMotion("system");
    expect(store.getState().reducedMotion).toBe(true);
    store.getState().setMotion("full");
    expect(store.getState().reducedMotion).toBe(false);
    store.getState().setReducedMotion(false);
    store.getState().setMotion("reduced");
    expect(store.getState().reducedMotion).toBe(true);
    store.getState().setMotion("system");
    expect(store.getState().reducedMotion).toBe(false);
  });

  it("persists the preference (version 3) and restores it on the next load", () => {
    const storage = memoryStorage();
    createHQStore(storage).getState().setMotion("reduced");
    const saved = JSON.parse(storage.data.get(STORE_KEY)!);
    expect(saved.version).toBe(3);
    expect(saved.state.motion).toBe("reduced");
    const again = createHQStore(storage);
    again.getState().setReducedMotion(false);
    expect(again.getState().motion).toBe("reduced");
    expect(again.getState().reducedMotion).toBe(true);
  });

  it("keeps a System picked after the change", () => {
    const storage = memoryStorage();
    createHQStore(storage).getState().setMotion("system");
    expect(JSON.parse(storage.data.get(STORE_KEY)!)).toMatchObject({ version: 3, state: { motion: "system" } });
    const again = createHQStore(storage);
    again.getState().setReducedMotion(true);
    expect(again.getState().motion).toBe("system");
    expect(again.getState().reducedMotion).toBe(true);
  });

  it("migrates a version 2 System (the old default) to Full and writes version 3", () => {
    const v2 = JSON.stringify({ state: { visited: ["L3:a"], firstVisit: false, locale: "id", motion: "system" }, version: 2 });
    const storage = memoryStorage({ [STORE_KEY]: v2 });
    const store = createHQStore(storage);
    store.getState().setReducedMotion(true);
    expect(store.getState().motion).toBe("full");
    expect(store.getState().reducedMotion).toBe(false);
    expect(store.getState().visited).toEqual(["L3:a"]);
    expect(store.getState().locale).toBe("id");
    expect(JSON.parse(storage.data.get(STORE_KEY)!)).toMatchObject({ version: 3, state: { motion: "full", locale: "id" } });
  });

  it("keeps a version 2 Reduced exactly as is", () => {
    const v2 = JSON.stringify({ state: { visited: [], firstVisit: false, locale: "en", motion: "reduced" }, version: 2 });
    const store = createHQStore(memoryStorage({ [STORE_KEY]: v2 }));
    store.getState().setReducedMotion(false);
    expect(store.getState().motion).toBe("reduced");
    expect(store.getState().reducedMotion).toBe(true);
  });

  it("migrates a version 1 payload to Full and keeps its keys", () => {
    const v1 = JSON.stringify({ state: { visited: ["L3:a"], firstVisit: false, locale: "id" }, version: 1 });
    const store = createHQStore(memoryStorage({ [STORE_KEY]: v1 }));
    expect(store.getState().motion).toBe("full");
    expect(store.getState().visited).toEqual(["L3:a"]);
    expect(store.getState().firstVisit).toBe(false);
    expect(store.getState().locale).toBe("id");
  });

  it("falls back to Full on an unknown stored value", () => {
    const bad = JSON.stringify({ state: { visited: [], firstVisit: true, locale: "en", motion: "wild" }, version: 3 });
    const store = createHQStore(memoryStorage({ [STORE_KEY]: bad }));
    expect(store.getState().motion).toBe("full");
  });
});
