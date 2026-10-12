import { describe, expect, it } from "vitest";
import type { DoorLatch } from "@/experience/nav/doors";
import { elevatorPad, elevatorPadId, PAD, padAt, pickerFor, primedPadLatch, stepPadLatch, teleportPadId } from "@/experience/nav/pads";
import type { PadTrigger } from "@/experience/types";

const lift: PadTrigger = { id: "elevator:L2", kind: "elevator", at: { x: -21, z: 0 }, face: 0 };
const tele: PadTrigger = { id: "teleport:2021", kind: "teleport", at: { x: 40, z: 6.5 }, year: 2021, face: 0 };
const pads = [lift, tele];
const still = { riding: false, explore: true, following: false, now: 0, speed: 0 };

describe("floor pads", () => {
  it("places the elevator pad on the approach in front of the shaft door", () => {
    expect(elevatorPad({ id: "L3", approach: { x: -21, z: 0 } }, Math.PI / 2)).toEqual({
      id: "elevator:L3",
      kind: "elevator",
      at: { x: -21, z: 0 },
      face: Math.PI / 2,
    });
    expect(elevatorPadId("RF")).toBe("elevator:RF");
    expect(teleportPadId(2019)).toBe("teleport:2019");
  });

  it("finds the pad whose circle contains a point", () => {
    expect(padAt(pads, { x: -21 + PAD.radius - 0.01, z: 0 })?.id).toBe("elevator:L2");
    expect(padAt(pads, { x: -21 + PAD.radius + 0.01, z: 0 })).toBeNull();
    expect(padAt(pads, { x: 40.5, z: 7 })?.id).toBe("teleport:2021");
    expect(padAt(undefined, { x: 0, z: 0 })).toBeNull();
  });

  it("opens the floor picker on an elevator pad and the year picker on a teleporter", () => {
    expect(pickerFor(lift)).toEqual({ kind: "floor" });
    expect(pickerFor(tele)).toEqual({ kind: "year", from: 2021 });
  });

  it("fires once when the rover stops on a pad and re-arms after it leaves", () => {
    const latch: DoorLatch<string> = { room: null };
    expect(stepPadLatch(latch, pads, lift.at, still)?.id).toBe("elevator:L2");
    expect(stepPadLatch(latch, pads, lift.at, still)).toBeNull();
    expect(stepPadLatch(latch, pads, { x: 0, z: 0 }, still)).toBeNull();
    expect(stepPadLatch(latch, pads, lift.at, still)?.id).toBe("elevator:L2");
  });

  it("does not fire while driving across a pad at speed, only after PAD.dwell", () => {
    const latch: DoorLatch<string> = { room: null };
    const fast = { ...still, speed: 9 };
    expect(stepPadLatch(latch, pads, tele.at, { ...fast, now: 1 })).toBeNull();
    expect(stepPadLatch(latch, pads, tele.at, { ...fast, now: 1 + PAD.dwell - 0.05 })).toBeNull();
    expect(stepPadLatch(latch, pads, tele.at, { ...fast, now: 1 + PAD.dwell + 0.01 })?.id).toBe("teleport:2021");
  });

  it("ignores pads while following a path, riding, or while a picker, beam or room is up", () => {
    const latch: DoorLatch<string> = { room: null };
    expect(stepPadLatch(latch, pads, lift.at, { ...still, following: true })).toBeNull();
    expect(stepPadLatch(latch, pads, lift.at, { ...still, riding: true })).toBeNull();
    expect(stepPadLatch(latch, pads, lift.at, { ...still, explore: false })).toBeNull();
    // Standing on it while not exploring latches it: it stays silent until the rover leaves.
    expect(stepPadLatch(latch, pads, lift.at, still)).toBeNull();
  });

  it("primes the latch for a rover that starts or arrives on a pad", () => {
    const latch = primedPadLatch(pads, lift.at);
    expect(latch.room).toBe("elevator:L2");
    expect(stepPadLatch(latch, pads, lift.at, still)).toBeNull();
    expect(primedPadLatch(pads, { x: 0, z: 0 }).room).toBeNull();
  });
});
