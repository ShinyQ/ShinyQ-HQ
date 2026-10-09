import { describe, expect, it } from "vitest";
import { buildFloorLayouts, READY_FLOORS, ROVER } from "@/experience/config";
import { LIBRARY, LIBRARY_STOPS, libraryObstacles, postStop, spineSlots } from "@/experience/floors/library/layout";
import { ROOF, ROOF_STOPS, roofObstacles, TERMINAL_COUNT, terminalSlots } from "@/experience/floors/roof/layout";
import { distanceToRect } from "@/experience/nav/collision";
import { doorAt } from "@/experience/nav/doors";
import { buildNavGrid, findPath, isWalkable } from "@/experience/nav/navgrid";
import type { Rect, Vec2 } from "@/experience/types";

const layouts = buildFloorLayouts(8);
const inside = (p: Vec2, r: Rect) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;

function expectReachable(floor: "L4" | "RF", stop: Vec2) {
  const layout = layouts[floor];
  const grid = buildNavGrid(layout, ROVER.radius);
  expect(isWalkable(grid, stop)).toBe(true);
  for (const o of layout.obstacles) expect(distanceToRect(stop, o)).toBeGreaterThanOrEqual(ROVER.radius);
  const path = findPath(grid, layout.approach, stop);
  expect(path?.length).toBeGreaterThan(0);
  const end = path![path!.length - 1];
  expect(Math.hypot(end.x - stop.x, end.z - stop.z)).toBeLessThan(0.75);
}

describe("L4 Library layout", () => {
  it("is a ready floor with shelves, lectern, models shelf, stage and research shelf as obstacles", () => {
    expect(READY_FLOORS).toEqual(expect.arrayContaining(["L1", "L4", "RF"]));
    expect(layouts.L4.obstacles).toEqual(libraryObstacles());
    expect(layouts.L4.obstacles).toHaveLength(6);
    expect(layouts.L4.bounds).toEqual({ minX: -24, maxX: 24, minZ: -16, maxZ: 16 });
  });

  it("puts the two blog rows at z = -2 and z = -10, and the publications shelf at z = +8", () => {
    expect([...LIBRARY.shelves.rows].sort((a, b) => a - b)).toEqual([-10, -2]);
    expect(LIBRARY.publications.z).toBe(8);
    expect(LIBRARY.stage).toMatchObject({ x: 16, z: 10 });
  });

  it("alternates spines between the rows, newest first, and keeps them on the shelf", () => {
    const slots = spineSlots(7);
    expect(slots.map((s) => s.row)).toEqual([0, 1, 0, 1, 0, 1, 0]);
    const { x, w } = LIBRARY.shelves;
    for (const s of slots) {
      expect(s.x).toBeGreaterThan(x - w / 2);
      expect(s.x).toBeLessThan(x + w / 2);
      expect(s.z).toBe(LIBRARY.shelves.rows[s.row] + LIBRARY.shelves.d / 2);
    }
    const row0 = slots.filter((s) => s.row === 0).map((s) => s.x);
    expect(row0).toEqual([...row0].sort((a, b) => a - b));
    expect(new Set(slots.map((s) => `${s.x}:${s.z}`)).size).toBe(7);
  });

  it("shrinks the spacing so a crowded shelf still fits", () => {
    const slots = spineSlots(60);
    const { x, w } = LIBRARY.shelves;
    for (const s of slots) expect(Math.abs(s.x - x)).toBeLessThanOrEqual(w / 2);
  });

  it("parks the rover in front of every spine, reachable from the elevator", () => {
    for (let i = 0; i < 7; i++) {
      const stop = postStop(i, 7);
      expect(stop.x).toBeCloseTo(spineSlots(7)[i].x);
      expect(stop.z).toBeGreaterThan(spineSlots(7)[i].z);
      expectReachable("L4", stop);
    }
  });

  it("parks in front of the models shelf, the talks stage and the research shelf next to the blog", () => {
    expectReachable("L4", LIBRARY_STOPS.publications);
    expectReachable("L4", LIBRARY_STOPS.talks);
    expectReachable("L4", LIBRARY_STOPS.research);
    expect(LIBRARY.research.x).toBeGreaterThan(LIBRARY.shelves.x + LIBRARY.shelves.w / 2);
    expect(LIBRARY_STOPS.talks.x).toBe(16);
  });
});

describe("RF Roof layout", () => {
  it("is a ready floor with the beacon, terminals and CV kiosk as obstacles", () => {
    expect(layouts.RF.obstacles).toEqual(roofObstacles());
    expect(layouts.RF.obstacles).toHaveLength(2 + TERMINAL_COUNT);
    expect(layouts.RF.door).toEqual({ x: -20, z: 0 });
    expect(inside({ x: ROOF.beacon.x, z: ROOF.beacon.z }, layouts.RF.obstacles[0])).toBe(true);
  });

  it("puts the comms terminals on an arc of radius 10 in front of the beacon", () => {
    const slots = terminalSlots();
    expect(slots).toHaveLength(TERMINAL_COUNT);
    for (const t of slots) {
      expect(Math.hypot(t.x - ROOF.beacon.x, t.z - ROOF.beacon.z)).toBeCloseTo(10);
      expect(t.z).toBeGreaterThan(ROOF.beacon.z);
    }
    const middle = Math.floor(TERMINAL_COUNT / 2);
    expect(slots[middle]).toMatchObject({ x: 0, angle: 0 });
    expect(slots[0].x).toBeCloseTo(-slots[TERMINAL_COUNT - 1].x);
  });

  it("parks in front of the middle terminal and the CV kiosk at (10, 6)", () => {
    expect(ROOF.kiosk).toMatchObject({ x: 10, z: 6 });
    expectReachable("RF", ROOF_STOPS.contact);
    expectReachable("RF", ROOF_STOPS.cv);
    expect(ROOF_STOPS.contact.x).toBe(0);
    expect(ROOF_STOPS.cv.x).toBe(10);
  });
});

describe("deep link spawns", () => {
  it("spawn L4 and RF on walkable cells in front of their content", () => {
    for (const floor of ["L4", "RF"] as const) {
      const layout = layouts[floor];
      expect(isWalkable(buildNavGrid(layout, ROVER.radius), layout.spawn)).toBe(true);
      expect(layout.spawn).not.toEqual(layout.approach);
    }
  });
});

describe("door triggers", () => {
  it("open the research shelf, the models shelf, the talks stage, the comms terminals and the CV kiosk at their stops", () => {
    expect(layouts.L4.doors).toEqual([
      { room: "L4:research", at: LIBRARY_STOPS.research },
      { room: "L4:publications", at: LIBRARY_STOPS.publications },
      { room: "L4:talks", at: LIBRARY_STOPS.talks },
    ]);
    expect(layouts.RF.doors).toEqual([
      { room: "RF:contact", at: ROOF_STOPS.contact },
      { room: "RF:cv", at: ROOF_STOPS.cv },
    ]);
  });

  it("keep the deep link spawns and the elevator approach outside every zone", () => {
    for (const floor of ["L4", "RF"] as const) {
      const { doors, spawn, approach } = layouts[floor];
      expect(doorAt(doors, spawn)).toBeNull();
      expect(doorAt(doors, approach)).toBeNull();
    }
  });

  it("leave the book spines without triggers so driving along the shelves opens nothing", () => {
    for (let i = 0; i < 7; i++) expect(doorAt(layouts.L4.doors, postStop(i, 7))).toBeNull();
  });
});
