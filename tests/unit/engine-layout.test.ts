import { describe, expect, it } from "vitest";
import { COMING_SOON_IDS, STATION_IDS } from "@/content/build-story";
import { yawLooking } from "@/experience/camera/look";
import { buildEngineLayout, ENGINE, ENGINE_BAYS, ENGINE_STATIONS, engineRoom } from "@/experience/floors/engine/layout";
import type { Rect } from "@/experience/types";
import { realLayouts } from "../helpers/real-layouts";
import { expectSpaceRules } from "../helpers/space";

const layout = buildEngineLayout();
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
const inside = (r: Rect, b: Rect) => r.minX >= b.minX && r.maxX <= b.maxX && r.minZ >= b.minZ && r.maxZ <= b.maxZ;

describe("B1 Engine Room layout", () => {
  it("keeps the bays in the build story's order: stations 1 to 5, then the two coming-soon bays", () => {
    expect([...ENGINE_BAYS]).toEqual([...STATION_IDS, ...COMING_SOON_IDS]);
    expect([...ENGINE_STATIONS]).toEqual([...STATION_IDS]);
  });

  it("lines seven bays along the aisle, alternating north and south; stations have doors, bays 6 and 7 are dark", () => {
    expect(layout.bays.map((b) => b.side)).toEqual(["north", "south", "north", "south", "north", "south", "north"]);
    expect(layout.bays.filter((b) => b.lit).map((b) => b.room)).toEqual(ENGINE_STATIONS.map(engineRoom));
    for (const bay of layout.bays.filter((b) => !b.lit)) expect([bay.room, bay.pad]).toEqual([null, null]);
    expect(layout.floor.doors?.map((d) => d.room)).toEqual(ENGINE_STATIONS.map(engineRoom));
    for (const bay of layout.bays) expect(inside(bay.rect, layout.floor.bounds), bay.id).toBe(true);
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

  it("keeps the elevator call pad area free and the workbench flush with the east edge, across the aisle's end", () => {
    for (const o of layout.floor.obstacles) expect(overlaps(o, layout.callPad)).toBe(false);
    expect(layout.workbench.maxX).toBe(ENGINE.bounds.maxX);
    expect(layout.workbench.minX).toBeGreaterThanOrEqual(ENGINE.aisle.endX + 6);
    expect(layout.workbench.minZ).toBeLessThan(0);
    expect(layout.workbench.maxZ).toBeGreaterThan(0);
  });

  it("rolls the rover on east along the aisle and looks east at the workbench; every station has a view into its bay", () => {
    const { floor } = layout;
    expect(floor.arrival).toEqual(ENGINE.arrival);
    expect(floor.spawn).toEqual(ENGINE.arrival);
    const zones = new Map(floor.viewZones?.map((z) => [z.id, z]));
    expect(zones.get("B1:arrival")).toMatchObject({ yaw: yawLooking({ x: 1, z: 0 }), travel: { x: 1, z: 0 }, arrivalOnly: true });
    expect(zones.get("B1:workbench")?.yaw).toBe(yawLooking({ x: 1, z: 0 }));
    for (const bay of layout.bays.filter((b) => b.lit)) expect(zones.get(`B1:${bay.id}`)?.yaw, bay.id).toBe(yawLooking(bay.facing));
  });
});
