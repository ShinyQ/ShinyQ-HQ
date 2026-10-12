import { beforeEach, describe, expect, it, vi } from "vitest";
import { HINTS_KEY, ONBOARDED_KEY, hintsOn, markOnboarded, onboarded, resetFlagMemory, setHintsOn, subscribeFlags, type FlagStorage } from "@/hud/dialog/storage";
import { registerTutorial, replayTutorial, subscribeTutorial, tutorialAvailable } from "@/hud/dialog/tutorial";

function memory(): FlagStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const broken: FlagStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

beforeEach(() => resetFlagMemory());

describe("onboarding flag", () => {
  it("is unset on a fresh browser and remembers done or skipped", () => {
    const storage = memory();
    expect(onboarded(storage)).toBe(false);
    markOnboarded("skipped", storage);
    expect(storage.data.get(ONBOARDED_KEY)).toBe("skipped");
    expect(onboarded(storage)).toBe(true);
  });

  it("ignores unknown values", () => {
    const storage = memory();
    storage.data.set(ONBOARDED_KEY, "maybe");
    expect(onboarded(storage)).toBe(false);
  });

  it("keeps the mark for this page when storage is blocked", () => {
    expect(onboarded(broken)).toBe(false);
    markOnboarded("done", broken);
    expect(onboarded(broken)).toBe(true);
  });
});

describe("hints flag", () => {
  it("is on unless the visitor turned it off", () => {
    const storage = memory();
    expect(hintsOn(storage)).toBe(true);
    setHintsOn(false, storage);
    expect(storage.data.get(HINTS_KEY)).toBe("off");
    resetFlagMemory();
    expect(hintsOn(storage)).toBe(false);
    setHintsOn(true, storage);
    expect(hintsOn(storage)).toBe(true);
  });

  it("notifies subscribers on every change", () => {
    const storage = memory();
    const listener = vi.fn();
    const off = subscribeFlags(listener);
    setHintsOn(false, storage);
    markOnboarded("done", storage);
    off();
    setHintsOn(true, storage);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("tutorial replay bridge", () => {
  it("runs the registered host and reports availability", () => {
    const listener = vi.fn();
    const offListener = subscribeTutorial(listener);
    expect(tutorialAvailable()).toBe(false);
    expect(replayTutorial()).toBe(false);
    const run = vi.fn();
    const off = registerTutorial(run);
    expect(tutorialAvailable()).toBe(true);
    expect(replayTutorial()).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    off();
    expect(tutorialAvailable()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    offListener();
  });

  it("ignores a stale unregister", () => {
    const first = registerTutorial(() => {});
    const second = registerTutorial(() => {});
    first();
    expect(tutorialAvailable()).toBe(true);
    second();
    expect(tutorialAvailable()).toBe(false);
  });
});
