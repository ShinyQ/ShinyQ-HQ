import { describe, expect, it, vi } from "vitest";
import { createLocalPref } from "@/lib/local-pref";

const isAB = (v: unknown): v is "a" | "b" => v === "a" || v === "b";
function memory() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), map } as unknown as Storage & { map: Map<string, string> };
}

describe("createLocalPref", () => {
  it("reads the fallback, then a stored valid value, and ignores invalid ones", () => {
    const store = memory();
    const pref = createLocalPref("k", "a", isAB, () => store);
    expect(pref.get()).toBe("a");
    store.setItem("k", "b");
    expect(pref.get()).toBe("b");
    store.setItem("k", "zzz");
    expect(pref.get()).toBe("a");
  });
  it("persists, notifies listeners and stops after unsubscribe", () => {
    const store = memory();
    const pref = createLocalPref("k", "a", isAB, () => store);
    const fn = vi.fn();
    const off = pref.subscribe(fn);
    pref.set("b");
    expect(store.getItem("k")).toBe("b");
    expect(fn).toHaveBeenCalledTimes(1);
    pref.set("b");
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    pref.set("a");
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("survives a throwing storage", () => {
    const pref = createLocalPref("k", "a", isAB, () => {
      throw new Error("blocked");
    });
    pref.set("b");
    expect(pref.get()).toBe("b");
  });
});
