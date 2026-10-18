import { describe, expect, it } from "vitest";
import { b1FromHash, floorProgress, PUBLIC_FLOOR_COUNT, watchFloorVisits, withFloorSeen } from "@/experience/b1";
import { createHQStore, STORE_KEY, STORE_VERSION } from "@/store/useHQStore";

const memory = (initial?: string) => {
  const data = new Map<string, string>(initial ? [[STORE_KEY, initial]] : []);
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

describe("B1 unlock: floor visits", () => {
  it("counts the five public floors, never B1, each once", () => {
    expect(PUBLIC_FLOOR_COUNT).toBe(5);
    expect(floorProgress([])).toEqual({ seen: 0, total: 5 });
    expect(floorProgress(["L1", "L3", "B1"])).toEqual({ seen: 2, total: 5 });
    expect(withFloorSeen({ floorsSeen: ["L1"], b1Unlocked: false }, "L1")).toBeNull();
    expect(withFloorSeen({ floorsSeen: ["L1"], b1Unlocked: false }, "B1")).toBeNull();
    expect(withFloorSeen({ floorsSeen: ["L1"], b1Unlocked: false }, "L2")).toEqual({ floorsSeen: ["L1", "L2"] });
  });

  it("unlocks B1 and starts the moment on the fifth floor, once", () => {
    expect(withFloorSeen({ floorsSeen: ["L1", "L2", "L3", "L4"], b1Unlocked: false }, "RF")).toEqual({ floorsSeen: ["L1", "L2", "L3", "L4", "RF"], b1Unlocked: true, b1Moment: true });
    // Unlocked earlier (the dev flag): the fifth floor is recorded without a moment.
    expect(withFloorSeen({ floorsSeen: ["L1", "L2", "L3", "L4"], b1Unlocked: true }, "RF")).toEqual({ floorsSeen: ["L1", "L2", "L3", "L4", "RF"] });
  });

  it("marks the floor the rover explores, not one it rides past", () => {
    const store = createHQStore(memory());
    const off = watchFloorVisits(store);
    store.setState({ phase: "explore", floor: "L1", ride: null });
    store.setState({ phase: "elevator", ride: { from: "L1", to: "L3", stage: "moving", t: 0 } });
    store.getState().arriveFloor("L3");
    expect(store.getState().floorsSeen).toEqual(["L1", "L3"]);
    off();
  });

  it("persists the floors and the unlock and restores them, dropping anything invalid", () => {
    const storage = memory();
    const store = createHQStore(storage);
    for (const f of ["L1", "L2", "L3", "L4", "RF"] as const) store.getState().markFloorSeen(f);
    expect(store.getState()).toMatchObject({ b1Unlocked: true, b1Moment: true });
    const saved = JSON.parse(storage.data.get(STORE_KEY)!);
    expect(saved).toMatchObject({ version: STORE_VERSION, state: { floorsSeen: ["L1", "L2", "L3", "L4", "RF"], b1Unlocked: true } });
    expect(saved.state.b1Moment).toBeUndefined();
    const restored = createHQStore(memory(JSON.stringify(saved)));
    expect(restored.getState()).toMatchObject({ b1Unlocked: true, b1Moment: false, floorsSeen: ["L1", "L2", "L3", "L4", "RF"] });
    const bad = createHQStore(memory(JSON.stringify({ state: { floorsSeen: ["L9", "B1", "L2"], b1Unlocked: "yes" }, version: 3 })));
    expect(bad.getState()).toMatchObject({ floorsSeen: ["L2"], b1Unlocked: false });
  });

  it("starts a legacy payload without the new keys with no floors and B1 locked", () => {
    const legacy = createHQStore(memory(JSON.stringify({ state: { visited: ["L3:a"], firstVisit: true, locale: "en", motion: "full" }, version: STORE_VERSION })));
    expect(legacy.getState()).toMatchObject({ floorsSeen: [], b1Unlocked: false, b1Moment: false });
  });

  it("keeps B1 locked when a saved unlock disagrees with the floors seen, as partialize would", () => {
    const three = createHQStore(memory(JSON.stringify({ state: { floorsSeen: ["L1", "L2", "L3"], b1Unlocked: true }, version: STORE_VERSION })));
    expect(three.getState()).toMatchObject({ floorsSeen: ["L1", "L2", "L3"], b1Unlocked: false });
    const all = createHQStore(memory(JSON.stringify({ state: { floorsSeen: ["L1", "L2", "L3", "L4", "RF"], b1Unlocked: true }, version: STORE_VERSION })));
    expect(all.getState().b1Unlocked).toBe(true);
  });

  it("reads #B1 on the Lobby route only", () => {
    expect(b1FromHash(undefined, "#B1")).toBe("B1");
    expect(b1FromHash(undefined, "#b1")).toBe("B1");
    expect(b1FromHash("L3", "#B1")).toBeUndefined();
    expect(b1FromHash(undefined, "#visits")).toBeUndefined();
  });
});
