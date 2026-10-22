import { describe, expect, it } from "vitest";
import { STATION_IDS } from "@/content/build-story";
import { RoomIdSchema } from "@/content/schema";
import { yawLooking } from "@/experience/camera/look";
import { buildEngineLayout, ENGINE, ENGINE_BAYS, ENGINE_REACTOR_ROOM, ENGINE_STATIONS, engineRoom } from "@/experience/floors/engine/layout";
import type { Rect } from "@/experience/types";
import { realLayouts } from "../helpers/real-layouts";
import { expectSpaceRules } from "../helpers/space";

const layout = buildEngineLayout();
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
const inside = (r: Rect, b: Rect) => r.minX >= b.minX && r.maxX <= b.maxX && r.minZ >= b.minZ && r.maxZ <= b.maxZ;
const contains = (r: Rect, p: { x: number; z: number }) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
/** Gap between two rects along the axis that separates them (0 when they touch or overlap). */
const gap = (a: Rect, b: Rect) => Math.max(0, b.minX - a.maxX, a.minX - b.maxX, b.minZ - a.maxZ, a.minZ - b.maxZ);

describe("B1 Engine Room layout", () => {
  it("keeps the bays in the build story's order: all seven are stations", () => {
    expect([...ENGINE_BAYS]).toEqual([...STATION_IDS]);
    expect([...ENGINE_STATIONS]).toEqual([...STATION_IDS]);
  });

  it("lines seven station bays along the aisle, alternating north and south, each with a room, a door pad, a door and a spur", () => {
    expect(layout.bays.map((b) => b.side)).toEqual(["north", "south", "north", "south", "north", "south", "north"]);
    const rooms = ENGINE_STATIONS.map(engineRoom);
    expect(layout.bays.map((b) => b.room)).toEqual(rooms);
    expect(layout.floor.doors?.map((d) => d.room)).toEqual([...rooms, ENGINE_REACTOR_ROOM]);
    expect(layout.network.spurs.map((s) => s.room)).toEqual([...rooms, ENGINE_REACTOR_ROOM]);
    for (const bay of layout.bays) {
      expect(inside(bay.rect, layout.floor.bounds), bay.id).toBe(true);
      expect(bay.pad, bay.id).toEqual({ x: bay.center.x, z: bay.front - bay.facing.z * ENGINE.padInset });
      expect(layout.floor.doors?.find((d) => d.room === bay.room)?.at, bay.id).toEqual(bay.pad);
    }
  });

  it("puts a rack row in every wall gap between two bays on the same side", () => {
    expect(layout.racks).toHaveLength(5);
    for (const rack of layout.racks) expect(layout.bays.filter((b) => b.rect.maxX === rack.minX || b.rect.minX === rack.maxX)).toHaveLength(2);
  });

  it("passes the road kit's space rules and the pad rules with the elevator and Return pads", () => {
    const b1 = realLayouts().B1;
    expect(b1.pads?.map((p) => p.kind)).toEqual(["elevator", "return"]);
    expectSpaceRules({ bounds: b1.bounds, obstacles: b1.obstacles, doors: b1.doors ?? [], network: layout.network, start: b1.approach, pads: b1.pads });
  });

  it("keeps the elevator call pad area free", () => {
    for (const o of layout.floor.obstacles) expect(overlaps(o, layout.callPad)).toBe(false);
  });

  it("ends the aisle in a reactor hall: the core on the aisle axis, east of every bay, an obstacle 6 u past the aisle's end", () => {
    const { reactor } = layout;
    expect(ENGINE.reactor.z).toBe(0);
    expect(reactor).toEqual({ minX: ENGINE.reactor.x - ENGINE.reactor.r, maxX: ENGINE.reactor.x + ENGINE.reactor.r, minZ: -ENGINE.reactor.r, maxZ: ENGINE.reactor.r });
    for (const bay of layout.bays) expect(reactor.minX, bay.id).toBeGreaterThan(bay.rect.maxX);
    expect(layout.floor.obstacles).toContainEqual(reactor);
    expect(inside(reactor, layout.floor.bounds)).toBe(true);
    expect(reactor.minX - ENGINE.aisle.endX).toBe(6);
    // The arrival looks east: its sight line runs through the core.
    expect(ENGINE.reactor.x).toBeGreaterThan(ENGINE.arrival.x);
    expect(Math.abs(ENGINE.arrival.z - ENGINE.reactor.z)).toBeLessThan(ENGINE.reactor.r);
    expect(ENGINE.reactor.h).toBeLessThanOrEqual(ENGINE.ceiling);
  });

  it("gives the reactor a room (not a station bay) with a door pad facing the core at the end of a spur from the aisle", () => {
    expect(RoomIdSchema.safeParse(ENGINE_REACTOR_ROOM).success).toBe(true);
    expect(ENGINE_REACTOR_ROOM).toBe("B1:reactor");
    expect(ENGINE_STATIONS.map(engineRoom)).not.toContain(ENGINE_REACTOR_ROOM);
    const door = layout.floor.doors?.find((d) => d.room === ENGINE_REACTOR_ROOM);
    expect(door).toEqual({ room: ENGINE_REACTOR_ROOM, at: { ...ENGINE.reactorDoor }, facing: { x: 1, z: 0 } });
    expect(door!.at.z).toBe(0);
    expect(door!.at.x).toBeGreaterThan(ENGINE.aisle.endX);
    expect(door!.at.x).toBeLessThan(layout.reactor.minX);
    const spur = layout.network.spurs.find((s) => s.room === ENGINE_REACTOR_ROOM);
    expect(spur?.from).toEqual({ x: ENGINE.aisle.endX, z: 0 });
    expect(spur?.to).toEqual(door!.at);
  });

  it("moves the workbench beside the core, flush with the south wall, an obstacle 6 u from the core", () => {
    const { workbench, reactor } = layout;
    expect(layout.floor.obstacles).toContainEqual(workbench);
    expect(inside(workbench, layout.floor.bounds)).toBe(true);
    expect(workbench.maxZ).toBe(ENGINE.bounds.maxZ);
    expect(workbench.minZ - reactor.maxZ).toBe(6);
    expect(workbench.minX).toBeGreaterThanOrEqual(reactor.minX);
    expect(workbench.maxX).toBeLessThanOrEqual(reactor.maxX);
    for (const o of layout.floor.obstacles) if (o !== workbench && o !== reactor) expect(gap(o, workbench), JSON.stringify(o)).toBeGreaterThanOrEqual(6);
  });

  it("rolls the rover on east along the aisle, looks east at the core and south at the workbench; every station has a view into its bay", () => {
    const { floor } = layout;
    expect(floor.arrival).toEqual(ENGINE.arrival);
    expect(floor.spawn).toEqual(ENGINE.arrival);
    const zones = new Map(floor.viewZones?.map((z) => [z.id, z]));
    expect(zones.get("B1:arrival")).toMatchObject({ area: { minX: -10, maxX: -6, minZ: -2, maxZ: 2 }, yaw: yawLooking({ x: 1, z: 0 }), travel: { x: 1, z: 0 }, arrivalOnly: true });
    const reactor = zones.get(ENGINE_REACTOR_ROOM)!;
    expect(reactor).toMatchObject({ yaw: yawLooking({ x: 1, z: 0 }), travel: { x: 1, z: 0 } });
    expect(contains(reactor.area, ENGINE.reactorDoor)).toBe(true);
    expect(reactor.area.minX).toBe(ENGINE.aisle.endX);
    expect(reactor.area.maxX).toBe(layout.reactor.minX);
    const bench = zones.get("B1:workbench")!;
    expect(bench.yaw).toBe(yawLooking({ x: 0, z: 1 }));
    expect(bench.area).toEqual({ minX: layout.workbench.minX, maxX: layout.workbench.maxX, minZ: layout.reactor.maxZ, maxZ: layout.workbench.minZ });
    for (const o of floor.obstacles) expect(overlaps(o, bench.area), JSON.stringify(o)).toBe(false);
    for (const bay of layout.bays) expect(zones.get(`B1:${bay.id}`)?.yaw, bay.id).toBe(yawLooking(bay.facing));
    expect(floor.viewZones?.filter((z) => ENGINE_STATIONS.some((id) => z.id === `B1:${id}`))).toHaveLength(7);
  });
});
