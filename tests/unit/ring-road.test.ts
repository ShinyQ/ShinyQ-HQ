import { describe, expect, it } from "vitest";
import { REACTOR, reactorRect, ringEntry, ringPoints } from "@/experience/floors/labs/reactor";
import { coreRect, ringRoadEntry, ringRoadPoints } from "@/experience/nav/ringRoad";

describe("shared ring road (L3 reactor, L4 constellation)", () => {
  const c = { x: 10, z: -3 };

  it("puts vertex 0 due north and runs clockwise seen from above", () => {
    const pts = ringRoadPoints(c, 5, 8);
    expect(pts).toHaveLength(8);
    expect(pts[0]).toEqual({ x: 10, z: -8 });
    expect(pts[2].x).toBeCloseTo(15);
    expect(pts[4]).toEqual({ x: 10, z: 2 });
  });

  it("meets a road from `from` on the circle toward it", () => {
    expect(ringRoadEntry(c, { x: -20, z: -3 }, 5)).toEqual({ x: 5, z: -3 });
    expect(ringRoadEntry(c, { x: 10, z: 30 }, 4)).toEqual({ x: 10, z: 1 });
  });

  it("builds a square core footprint", () => {
    expect(coreRect(c, 2)).toEqual({ minX: 8, maxX: 12, minZ: -5, maxZ: -1 });
  });

  it("keeps the L3 reactor helpers unchanged", () => {
    expect(ringPoints(c)).toEqual(ringRoadPoints(c, REACTOR.ring, REACTOR.segments));
    expect(ringEntry(c, { x: 40, z: 9 })).toEqual(ringRoadEntry(c, { x: 40, z: 9 }, REACTOR.ring));
    expect(reactorRect(c)).toEqual(coreRect(c, REACTOR.half));
  });
});
