import { describe, expect, it } from "vitest";
import { RoomIdSchema, FloorIdSchema } from "@/content/schema";
import { FLOOR_GAP, FLOOR_IDS, floorIndex, floorY, READY_FLOORS, shaftSpan, SLAB_THICKNESS, towerFloors } from "@/experience/config";
import { dollyDuration, rideDirection } from "@/experience/tower/elevator";
import { nearFloors } from "@/experience/tower/near";
import { isPublicFloor, PUBLIC_FLOORS, SECRET_FLOOR } from "@/lib/floors";
import { createHQStore } from "@/store/useHQStore";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

describe("floor ids (B1 Engine Room, PR 2)", () => {
  it("orders the floors bottom up with B1 under the Lobby and keeps a list of the five public floors", () => {
    expect(FloorIdSchema.options).toEqual(["L1", "L2", "L3", "L4", "RF", "B1"]);
    expect([...FLOOR_IDS]).toEqual(["B1", "L1", "L2", "L3", "L4", "RF"]);
    expect([...PUBLIC_FLOORS]).toEqual(["L1", "L2", "L3", "L4", "RF"]);
    expect(SECRET_FLOOR).toBe("B1");
    expect(FLOOR_IDS.filter(isPublicFloor)).toEqual([...PUBLIC_FLOORS]);
    expect(READY_FLOORS).toContain("B1");
    expect(RoomIdSchema.safeParse("B1:blueprint").success).toBe(true);
  });

  it("keeps every public floor at its height and puts B1 one floor gap below the Lobby", () => {
    expect(PUBLIC_FLOORS.map(floorY)).toEqual([0, 14, 28, 42, 56]);
    expect(floorY("B1")).toBe(-FLOOR_GAP);
    expect(floorIndex("L1") - floorIndex("B1")).toBe(1);
  });

  it("times rides by floor distance, B1 included", () => {
    expect(dollyDuration("L1", "B1")).toBeCloseTo(0.8, 9);
    expect(dollyDuration("RF", "B1")).toBeCloseTo(0.8 + 0.15 * 4, 9);
    expect(rideDirection({ from: "L1", to: "B1", stage: "moving", t: 0 })).toBe("down");
  });

  it("draws and serves B1 only once unlocked: tower floors, near floors and the shaft", () => {
    expect(towerFloors(false)).toEqual(PUBLIC_FLOORS);
    expect(towerFloors(true)).toEqual(FLOOR_IDS);
    expect(nearFloors("L1", null, false)).toEqual(["L1", "L2"]);
    expect(nearFloors("L1", null, false, 1, null, towerFloors(true))).toEqual(["B1", "L1", "L2"]);
    expect(shaftSpan(PUBLIC_FLOORS)).toEqual({ bottom: -SLAB_THICKNESS, height: floorY("RF") + 8 + SLAB_THICKNESS });
    expect(shaftSpan(FLOOR_IDS)).toEqual({ bottom: floorY("B1") - SLAB_THICKNESS, height: floorY("RF") + 8 - floorY("B1") + SLAB_THICKNESS });
  });

  it("never rides to B1 while it is locked, not even one floor down from the Lobby", () => {
    const store = createHQStore(memory());
    store.setState({ phase: "explore", floor: "L1", ride: null });
    store.getState().requestElevator("B1");
    expect(store.getState().ride).toBeNull();
    store.getState().requestElevator("down");
    expect(store.getState().ride).toBeNull();
    store.getState().requestElevator("up");
    expect(store.getState().ride?.to).toBe("L2");
  });
});
