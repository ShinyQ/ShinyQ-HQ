import { describe, expect, it } from "vitest";
import { createJSONStorage } from "zustand/middleware";
import { skipUnchanged } from "@/store/persist-storage";

function memory() {
  const data = new Map<string, string>();
  const counter = { writes: 0 };
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      counter.writes += 1;
      data.set(key, value);
    },
    removeItem: (key: string) => void data.delete(key),
  };
  return { data, counter, storage };
}

describe("skipUnchanged", () => {
  it("writes only when a persisted key (shallow) or the version changed", () => {
    const m = memory();
    const s = skipUnchanged(createJSONStorage<{ visited: string[]; locale: string }>(() => m.storage))!;
    const visited = ["L3:a"];
    s.setItem("k", { state: { visited, locale: "en" }, version: 1 });
    s.setItem("k", { state: { visited, locale: "en" }, version: 1 });
    expect(m.counter.writes).toBe(1);
    s.setItem("k", { state: { visited: [...visited, "L3:b"], locale: "en" }, version: 1 });
    expect(m.counter.writes).toBe(2);
    s.setItem("k", { state: { visited, locale: "id" }, version: 1 });
    s.setItem("k", { state: { visited, locale: "id" }, version: 2 });
    expect(m.counter.writes).toBe(4);
    expect(JSON.parse(m.data.get("k")!)).toEqual({ state: { visited: ["L3:a"], locale: "id" }, version: 2 });
  });

  it("treats what it read as written, so hydration does not write the same value back", () => {
    const m = memory();
    m.data.set("k", JSON.stringify({ state: { locale: "en" }, version: 1 }));
    const s = skipUnchanged(createJSONStorage<{ locale: string }>(() => m.storage))!;
    const read = s.getItem("k") as { state: { locale: string }; version: number };
    s.setItem("k", { state: { locale: read.state.locale }, version: 1 });
    expect(m.counter.writes).toBe(0);
  });

  it("writes again after removeItem, and passes an unavailable storage through", () => {
    const m = memory();
    const s = skipUnchanged(createJSONStorage<{ locale: string }>(() => m.storage))!;
    s.setItem("k", { state: { locale: "en" }, version: 1 });
    s.removeItem("k");
    s.setItem("k", { state: { locale: "en" }, version: 1 });
    expect(m.counter.writes).toBe(2);
    expect(skipUnchanged(undefined)).toBeUndefined();
  });
});
