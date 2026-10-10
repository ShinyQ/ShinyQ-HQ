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

  it("is 1.6 u deep along the approach and the door's width across it", () => {
    const north = [{ room: "L3:n" as const, at: { x: 0, z: -5 }, facing: { x: 0, z: -1 } }];
    expect(doorAt(north, { x: 1.1, z: -5 })?.room).toBe("L3:n");
    expect(doorAt(north, { x: 0, z: -5.9 })).toBeNull();
    expect(doorAt(north, { x: 1.3, z: -5 })).toBeNull();
  });

  it("opens at once when the rover drives into the door, but not when it drives past", () => {
    const facing = { x: 0, z: -1 };
    const into: DoorLatch = { room: null };
    // Heading PI faces -z: straight into a north door.
    expect(stepDoorLatch(into, "L3:a", { explore: true, following: false, now: 0, speed: 9, heading: Math.PI, facing })).toBe("L3:a");
    const past: DoorLatch = { room: null };
    // Heading PI / 2 faces +x: along the corridor, past the pad.
    expect(stepDoorLatch(past, "L3:a", { explore: true, following: false, now: 0, speed: 9, heading: Math.PI / 2, facing })).toBeNull();
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

describe("door facings", () => {
  it("every door on every floor points into its room", async () => {
    const { buildFloorLayouts } = await import("@/experience/config");
    const { buildExperienceData } = await import("@/content/experience");
    const { careerLayoutInput } = await import("@/experience/floors/career/layout");
    const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
    const layouts = buildFloorLayouts(data.years.length, { labs: data.labs.pods, career: careerLayoutInput(data.career) });
    for (const layout of Object.values(layouts))
      for (const door of layout.doors ?? []) {
        expect(door.facing, door.room).toBeDefined();
        expect(Math.hypot(door.facing!.x, door.facing!.z)).toBeCloseTo(1);
        // A step from the pad along `facing` gets closer to the nearest obstacle (the room's content).
        const d = (p: { x: number; z: number }) => Math.min(...layout.obstacles.map((o) => Math.hypot(Math.max(o.minX - p.x, 0, p.x - o.maxX), Math.max(o.minZ - p.z, 0, p.z - o.maxZ))));
        const step = { x: door.at.x + door.facing!.x * 0.5, z: door.at.z + door.facing!.z * 0.5 };
        expect(d(step), door.room).toBeLessThan(d(door.at));
      }
  });
});
