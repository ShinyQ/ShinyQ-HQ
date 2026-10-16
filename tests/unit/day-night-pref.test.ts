import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DAY_NIGHT_KEY,
  dayNightOn,
  readDayNight,
  setDayNight,
  subscribeDayNight,
} from "@/lib/day-night";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const broken = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

const unsubscribers: Array<() => void> = [];
function subscribe(listener: () => void) {
  const off = subscribeDayNight(listener);
  unsubscribers.push(off);
  return off;
}

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => {
  while (unsubscribers.length) unsubscribers.pop()?.();
  vi.unstubAllGlobals();
});

describe("day and night preference", () => {
  it("is unset on a fresh browser", () => {
    expect(readDayNight()).toBeNull();
  });

  it("stores the visitor's choice and notifies subscribers once", () => {
    const listener = vi.fn();
    subscribe(listener);
    setDayNight(false);
    expect(storage.data.get(DAY_NIGHT_KEY)).toBe("off");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readDayNight()).toBe("off");
    setDayNight(true);
    expect(storage.data.get(DAY_NIGHT_KEY)).toBe("on");
    expect(readDayNight()).toBe("on");
  });

  it("reads an invalid stored value as unset", () => {
    storage.data.set(DAY_NIGHT_KEY, "maybe");
    expect(readDayNight()).toBeNull();
  });

  it("notifies on a storage event for its key only", () => {
    const listener = vi.fn();
    subscribe(listener);
    const event = Object.assign(new Event("storage"), { key: "hq:other" });
    window.dispatchEvent(event);
    expect(listener).not.toHaveBeenCalled();
    const mine = Object.assign(new Event("storage"), { key: DAY_NIGHT_KEY });
    window.dispatchEvent(mine);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const off = subscribe(listener);
    off();
    setDayNight(false);
    window.dispatchEvent(Object.assign(new Event("storage"), { key: DAY_NIGHT_KEY }));
    expect(listener).not.toHaveBeenCalled();
  });

  it("reads null and does not throw when storage is blocked", () => {
    vi.stubGlobal("localStorage", broken);
    const listener = vi.fn();
    subscribe(listener);
    expect(readDayNight()).toBeNull();
    expect(() => setDayNight(false)).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("dayNightOn", () => {
  it("follows the Motion setting when unset", () => {
    expect(dayNightOn(null, false)).toBe(true);
    expect(dayNightOn(null, true)).toBe(false);
  });

  it("lets the stored choice win over reduced motion", () => {
    expect(dayNightOn("on", true)).toBe(true);
    expect(dayNightOn("off", false)).toBe(false);
  });
});
