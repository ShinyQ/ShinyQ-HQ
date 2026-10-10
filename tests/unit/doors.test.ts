import { describe, expect, it } from "vitest";
import { DOOR_DWELL, DOOR_SLOW, DOOR_SIZE, doorAlong, doorAt, stepDoorLatch, type DoorLatch } from "@/experience/nav/doors";
import type { DoorTrigger } from "@/experience/types";

const doors: DoorTrigger[] = [
  { room: "L3:a", at: { x: 0, z: 2 } },
  { room: "L3:b", at: { x: 10, z: 2 }, size: 4 },
];

describe("door triggers", () => {
  it("finds the zone that contains a point (the 1.6 u pad by default)", () => {
    expect(DOOR_SIZE).toBe(1.6);
    expect(doorAt(doors, { x: 0.7, z: 2.7 })?.room).toBe("L3:a");
    expect(doorAt(doors, { x: 0.9, z: 2 })).toBeNull();
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

describe("intentional door triggers", () => {
  it("does not open while the rover just drives through a zone at speed", () => {
    const latch: DoorLatch = { room: null };
    const fast = (now: number) => ({ explore: true, following: false, now, speed: 9 });
    expect(stepDoorLatch(latch, "L3:a", fast(0))).toBeNull();
    expect(stepDoorLatch(latch, "L3:a", fast(0.1))).toBeNull();
    expect(stepDoorLatch(latch, "L3:a", fast(0.18))).toBeNull();
    expect(stepDoorLatch(latch, null, fast(0.2))).toBeNull();
  });

  it("opens after a short dwell, or at once when the rover slows down in the zone", () => {
    const dwell: DoorLatch = { room: null };
    expect(stepDoorLatch(dwell, "L3:a", { explore: true, following: false, now: 1, speed: 6 })).toBeNull();
    expect(stepDoorLatch(dwell, "L3:a", { explore: true, following: false, now: 1 + DOOR_DWELL, speed: 6 })).toBe("L3:a");
    const slow: DoorLatch = { room: null };
    expect(stepDoorLatch(slow, "L3:a", { explore: true, following: false, now: 5, speed: DOOR_SLOW - 0.1 })).toBe("L3:a");
  });

  it("still opens when a click or mission path ends on the pad", () => {
    const latch: DoorLatch = { room: null };
    expect(stepDoorLatch(latch, "L3:a", { explore: true, following: true, now: 0, speed: 8 })).toBeNull();
    expect(stepDoorLatch(latch, "L3:a", { explore: true, following: false, now: 0.05, speed: 0 })).toBe("L3:a");
  });
});

describe("swept door checks", () => {
  it("finds a zone crossed between two frames", () => {
    expect(doorAlong(doors, { x: -3, z: 2 }, { x: 3, z: 2 }, null)?.room).toBe("L3:a");
    expect(doorAlong(doors, { x: -3, z: 5 }, { x: 3, z: 5 }, null)).toBeNull();
  });

  it("skips the zone the rover is leaving", () => {
    expect(doorAlong(doors, { x: 0, z: 2 }, { x: 4, z: 2 }, "L3:a")).toBeNull();
    expect(doorAlong(doors, { x: 0, z: 2 }, { x: 9, z: 2 }, "L3:a")?.room).toBe("L3:b");
  });
});
