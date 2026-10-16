import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { SETTINGS } from "@/hud/settings/defs";
import { dayNightSetting } from "@/hud/settings/defs/day-night";
import { DAY_NIGHT_KEY } from "@/lib/day-night";
import { getHQStore } from "@/store/useHQStore";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const control = dayNightSetting.control as Extract<typeof dayNightSetting.control, { kind: "toggle" }>;
const unsubscribers: Array<() => void> = [];
const subscribe = (listener: () => void) => {
  const off = dayNightSetting.subscribe(listener);
  unsubscribers.push(off);
  return off;
};

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", new EventTarget());
  getHQStore().getState().setMotion("full");
});

afterEach(() => {
  while (unsubscribers.length) unsubscribers.pop()?.();
  getHQStore().getState().setMotion("full");
  vi.unstubAllGlobals();
});

describe("Day and night setting", () => {
  it("is registered in the display group at order 30", () => {
    const def = SETTINGS.find((s) => s.id === "day-night");
    expect(def).toBe(dayNightSetting);
    expect(def?.group).toBe("display");
    expect(def?.order).toBe(30);
    expect(def?.control.kind).toBe("toggle");
  });

  it("is on when unset and reduced motion is off", () => {
    expect(control.get()).toBe(true);
  });

  it("is off when unset and reduced motion is on", () => {
    getHQStore().getState().setMotion("reduced");
    expect(control.get()).toBe(false);
  });

  it("stays on when the visitor stored on, even with reduced motion", () => {
    storage.data.set(DAY_NIGHT_KEY, "on");
    getHQStore().getState().setMotion("reduced");
    expect(control.get()).toBe(true);
  });

  it("stores the choice under hq:day-night", () => {
    control.set(false);
    expect(storage.data.get(DAY_NIGHT_KEY)).toBe("off");
    expect(control.get()).toBe(false);
  });

  it("notifies subscribers when the choice changes", () => {
    const listener = vi.fn();
    subscribe(listener);
    control.set(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers when reduced motion changes in the store", () => {
    const listener = vi.fn();
    subscribe(listener);
    getHQStore().getState().setMotion("reduced");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify on unrelated store changes", () => {
    const listener = vi.fn();
    subscribe(listener);
    getHQStore().getState().setDevice({ coarse: true });
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const off = subscribe(listener);
    off();
    control.set(false);
    getHQStore().getState().setMotion("reduced");
    expect(listener).not.toHaveBeenCalled();
  });

  it.each([
    ["en", en],
    ["id", id],
  ])("resolves every key used by the setting in %s messages", (_name, messages) => {
    const settings = (messages as { hud: { settings?: Record<string, unknown> } }).hud.settings;
    expect(settings).toBeDefined();
    const resolve = (key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], settings);
    for (const key of [dayNightSetting.labelKey, dayNightSetting.hintKey!]) {
      expect(typeof resolve(key), key).toBe("string");
    }
  });
});
