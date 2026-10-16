import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FLOOR_INTRO_KEY,
  HINTS_KEY,
  ONBOARDED_KEY,
  floorIntroSeen,
  hintsOn,
  markFloorIntroSeen,
  markOnboarded,
  onboarded,
  resetFlagMemory,
  setHintsOn,
  subscribeFlags,
  type FlagStorage,
} from "@/hud/dialog/storage";
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

describe("floor intro flag", () => {
  it("is unset on a fresh browser and remembers each floor in hq:floor-intro", () => {
    const storage = memory();
    expect(FLOOR_INTRO_KEY).toBe("hq:floor-intro");
    expect(floorIntroSeen("L3", storage)).toBe(false);
    markFloorIntroSeen("L3", storage);
    expect(storage.data.get(FLOOR_INTRO_KEY)).toBe(JSON.stringify(["L3"]));
    expect(floorIntroSeen("L3", storage)).toBe(true);
    expect(floorIntroSeen("L4", storage)).toBe(false);
    markFloorIntroSeen("L3", storage);
    markFloorIntroSeen("RF", storage);
    expect(storage.data.get(FLOOR_INTRO_KEY)).toBe(JSON.stringify(["L3", "RF"]));
  });

  it("counts a floor listed in the legacy hq:walk-prompt as seen and never writes that key", () => {
    const storage = memory();
    storage.data.set("hq:walk-prompt", JSON.stringify(["L2", "RF"]));
    expect(floorIntroSeen("L2", storage)).toBe(true);
    expect(floorIntroSeen("L3", storage)).toBe(false);
    markFloorIntroSeen("L3", storage);
    expect(storage.data.get("hq:walk-prompt")).toBe(JSON.stringify(["L2", "RF"]));
  });

  it("tolerates bad JSON and blocked storage", () => {
    const storage = memory();
    storage.data.set(FLOOR_INTRO_KEY, "{oops");
    storage.data.set("hq:walk-prompt", "nope");
    expect(floorIntroSeen("L2", storage)).toBe(false);
    markFloorIntroSeen("L2", storage);
    expect(floorIntroSeen("L2", storage)).toBe(true);
    expect(() => floorIntroSeen("L4", broken)).not.toThrow();
    expect(floorIntroSeen("L4", broken)).toBe(false);
    expect(() => markFloorIntroSeen("L4", broken)).not.toThrow();
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
