import { describe, expect, it } from "vitest";
import { b1UnlockFlag, canEnterFloor } from "@/experience/b1";
import { floorRows } from "@/hud/floorRows";
import { createHQStore } from "@/store/useHQStore";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

describe("B1 unlock flag (dev and test only)", () => {
  it("honours ?unlock=b1 in a dev build, and in a production build only with debug", () => {
    expect(b1UnlockFlag("?unlock=b1", true)).toBe(true);
    expect(b1UnlockFlag("?unlock=B1&tier=lite", true)).toBe(true);
    expect(b1UnlockFlag("?unlock=b1", false)).toBe(false);
    expect(b1UnlockFlag("?unlock=b1&debug=1", false)).toBe(true);
    expect(b1UnlockFlag("?unlock=b1&debug", false)).toBe(true);
    expect(b1UnlockFlag("?debug=1", true)).toBe(false);
    expect(b1UnlockFlag("", true)).toBe(false);
  });

  it("lets every public floor in and B1 only once unlocked", () => {
    expect(canEnterFloor("RF", false)).toBe(true);
    expect(canEnterFloor("B1", false)).toBe(false);
    expect(canEnterFloor("B1", true)).toBe(true);
  });

  it("lists the elevator rows top-down, with B1 below L1 only once unlocked", () => {
    expect(floorRows(false)).toEqual(["RF", "L4", "L3", "L2", "L1"].map((id) => ({ id, locked: false })));
    expect(floorRows(true).map((r) => r.id)).toEqual(["RF", "L4", "L3", "L2", "L1", "B1"]);
    expect(floorRows(true).every((r) => !r.locked)).toBe(true);
  });

  it("rides to B1 (by name or one floor down from the Lobby) once the store flag is set", () => {
    const store = createHQStore(memory());
    store.setState({ phase: "explore", floor: "L1", ride: null });
    expect(store.getState().b1Unlocked).toBe(false);
    store.getState().requestElevator("B1");
    expect(store.getState().ride).toBeNull();
    store.getState().unlockB1();
    store.getState().requestElevator("down");
    expect(store.getState().ride).toMatchObject({ from: "L1", to: "B1", stage: "toDoor" });
  });

  it("keeps the flag unlock in memory: only a real unlock persists", () => {
    const storage = memory();
    const store = createHQStore(storage);
    store.getState().unlockB1();
    store.getState().setLocale("id");
    expect(storage.getItem("hq:v1")).toContain('"b1Unlocked":false');
    expect(store.getState().b1Unlocked).toBe(true);
    for (const f of ["L1", "L2", "L3", "L4", "RF"] as const) store.getState().markFloorSeen(f);
    expect(storage.getItem("hq:v1")).toContain('"b1Unlocked":true');
  });
});
