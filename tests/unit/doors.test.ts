import { describe, expect, it } from "vitest";
import { doorAt, stepDoorLatch, type DoorLatch } from "@/experience/nav/doors";
import type { DoorTrigger } from "@/experience/types";

const doors: DoorTrigger[] = [
  { room: "L3:a", at: { x: 0, z: 2 } },
  { room: "L3:b", at: { x: 10, z: 2 }, size: 4 },
];

describe("door triggers", () => {
  it("finds the zone that contains a point (2 x 2 by default)", () => {
    expect(doorAt(doors, { x: 0.9, z: 2.9 })?.room).toBe("L3:a");
    expect(doorAt(doors, { x: 1.2, z: 2 })).toBeNull();
    expect(doorAt(doors, { x: 11.8, z: 0.2 })?.room).toBe("L3:b");
    expect(doorAt(undefined, { x: 0, z: 2 })).toBeNull();
  });

  it("fires once when the rover stops in a zone, then stays latched until it leaves", () => {
    const latch: DoorLatch = { room: null };
    const explore = { explore: true, following: false };
    expect(stepDoorLatch(latch, "L3:a", explore)).toBe("L3:a");
    expect(stepDoorLatch(latch, "L3:a", explore)).toBeNull();
    expect(stepDoorLatch(latch, null, explore)).toBeNull();
    expect(stepDoorLatch(latch, "L3:a", explore)).toBe("L3:a");
  });

  it("does not fire while following a path through the zone, but fires on arrival", () => {
    const latch: DoorLatch = { room: null };
    expect(stepDoorLatch(latch, "L3:a", { explore: true, following: true })).toBeNull();
    expect(stepDoorLatch(latch, "L3:a", { explore: true, following: false })).toBe("L3:a");
  });

  it("latches while a room is open so closing the drawer does not reopen it", () => {
    const latch: DoorLatch = { room: null };
    expect(stepDoorLatch(latch, "L3:a", { explore: false, following: false })).toBeNull();
    expect(stepDoorLatch(latch, "L3:a", { explore: true, following: false })).toBeNull();
    expect(stepDoorLatch(latch, "L3:b", { explore: true, following: false })).toBe("L3:b");
  });
});
