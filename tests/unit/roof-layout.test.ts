import { describe, expect, it } from "vitest";
import { followPose, forwardOf } from "@/experience/camera/rigs";
import { ROVER } from "@/experience/config";
import { buildRoofLayout, channelSlots, ROOF_DECK, roofActive, type RoofStop } from "@/experience/floors/roof/layout";
import { distanceToRect } from "@/experience/nav/collision";
import { doorAt } from "@/experience/nav/doors";
import { buildNavGrid, findPath, isWalkable } from "@/experience/nav/navgrid";
import { rectGap } from "@/experience/nav/space";
import type { Rect, Vec2 } from "@/experience/types";
import { expectSpaceRules } from "../helpers/space";

const layout = buildRoofLayout();
const { floor } = layout;
const inside = (p: Vec2, r: Rect) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;

describe("RF roof deck layout", () => {
  it("passes the walkable floor space rules whatever the channel count", () => {
    for (const channels of [0, 6, 12]) {
      const l = buildRoofLayout({ channels });
      expectSpaceRules({ bounds: l.floor.bounds, obstacles: l.floor.obstacles, doors: l.floor.doors ?? [], network: l.network, start: l.floor.approach });
    }
  });

  it("keeps today's elevator door and approach, and rolls arrivals on to the spawn", () => {
    expect(floor).toMatchObject({ id: "RF", door: { x: -20, z: 0 }, approach: { x: -17, z: 0 }, accent: ROOF_DECK.accent });
    expect(floor.road).toBe(layout.network);
    expect(floor.arrival).toEqual(floor.spawn);
    expect(floor.spawn).not.toEqual(floor.approach);
  });

  it("keeps the spot in front of the elevator free for the call pad", () => {
    const pad = layout.callPad;
    expect(inside(floor.approach, pad)).toBe(true);
    for (const o of floor.obstacles) expect(rectGap(o, pad)).toBeGreaterThan(0);
    for (const d of floor.doors ?? []) expect(inside(d.at, pad)).toBe(false);
    for (const s of Object.values(layout.stops)) expect(inside(s, pad)).toBe(false);
    expect(inside(floor.spawn, pad)).toBe(false);
  });

  it("opens RF:contact at the comms station and RF:cv at the CV station, pads facing in", () => {
    expect(floor.doors).toEqual([
      { room: "RF:contact", at: layout.stops.contact, facing: { x: 0, z: -1 } },
      { room: "RF:cv", at: layout.stops.cv, facing: { x: 1, z: 0 } },
    ]);
    expect(distanceToRect(layout.stops.contact, layout.comms)).toBeCloseTo(ROOF_DECK.padInset);
    expect(distanceToRect(layout.stops.cv, layout.cv)).toBeCloseTo(ROOF_DECK.padInset);
    const [a, b] = floor.doors!;
    expect(Math.hypot(a.at.x - b.at.x, a.at.z - b.at.z)).toBeGreaterThan(3);
    expect(doorAt(floor.doors, floor.spawn)).toBeNull();
    expect(doorAt(floor.doors, floor.approach)).toBeNull();
    expect(doorAt(floor.doors, layout.stops.about)).toBeNull();
    expect(doorAt(floor.doors, layout.stops.availability)).toBeNull();
  });

  it("reaches every stop and the spawn from the elevator on the navgrid", () => {
    const grid = buildNavGrid(floor, ROVER.radius);
    for (const [name, stop] of Object.entries(layout.stops)) {
      expect(isWalkable(grid, stop), name).toBe(true);
      const path = findPath(grid, floor.approach, stop);
      expect(path?.length, name).toBeGreaterThan(0);
      const end = path![path!.length - 1];
      expect(Math.hypot(end.x - stop.x, end.z - stop.z), name).toBeLessThan(0.75);
    }
    expect(isWalkable(grid, floor.spawn)).toBe(true);
  });

  it("turns the follow camera toward each station at its stop", () => {
    const stations: [RoofStop, Rect][] = [
      ["contact", layout.comms],
      ["cv", layout.cv],
      ["about", layout.about],
      ["availability", layout.centerpiece],
    ];
    for (const [stop, station] of stations) {
      const p = layout.stops[stop];
      const zone = (floor.viewZones ?? []).find((z) => inside(p, z.area));
      expect(zone?.id, stop).toBe(`RF:${stop}`);
      const forward = forwardOf(followPose("desktop", [p.x, 0, p.z], zone!.yaw, zone!.zoom ?? 1));
      const c = { x: (station.minX + station.maxX) / 2 - p.x, z: (station.minZ + station.maxZ) / 2 - p.z };
      const cos = (forward.x * c.x + forward.z * c.z) / Math.hypot(c.x, c.z);
      expect(cos, stop).toBeGreaterThan(0.9);
    }
  });

  it("hangs the availability sign square to the spawn camera, the availability stop in front of it", () => {
    const zone = (floor.viewZones ?? []).find((z) => z.id === "RF:overview")!;
    const forward = forwardOf(followPose("desktop", [floor.spawn.x, 0, floor.spawn.z], zone.yaw, zone.zoom ?? 1));
    const normal = { x: Math.sin(ROOF_DECK.signYaw), z: Math.cos(ROOF_DECK.signYaw) };
    expect(forward.x * normal.x + forward.z * normal.z).toBeCloseTo(-1, 3);
    const c = layout.centerpiece.center;
    const s = layout.stops.availability;
    const d = Math.hypot(s.x - c.x, s.z - c.z);
    expect(((s.x - c.x) / d) * normal.x + ((s.z - c.z) / d) * normal.z).toBeGreaterThan(0.999);
  });

  it("has view zones that never overlap, with the overview around the spawn", () => {
    const zones = floor.viewZones ?? [];
    for (let i = 0; i < zones.length; i++)
      for (let j = i + 1; j < zones.length; j++) expect(overlaps(zones[i].area, zones[j].area), `${zones[i].id} ${zones[j].id}`).toBe(false);
    expect(zones.find((z) => inside(floor.spawn, z.area))?.id).toBe("RF:overview");
  });

  it("spreads the channel anchors across the comms station", () => {
    expect(channelSlots(0)).toEqual([]);
    expect(channelSlots(1)).toEqual([{ x: 2, z: -17 }]);
    const six = layout.channelSlots;
    expect(six).toHaveLength(6);
    expect(six[0].x).toBeCloseTo(layout.comms.minX + 1);
    expect(six[5].x).toBeCloseTo(layout.comms.maxX - 1);
    for (let i = 1; i < six.length; i++) expect(six[i].x).toBeGreaterThan(six[i - 1].x);
    for (const s of six) expect(inside(s, layout.comms)).toBe(true);
    expect(buildRoofLayout({ channels: 3 }).channelSlots).toHaveLength(3);
  });

  it("maps the open RF room to the scenery state", () => {
    expect(roofActive("room", "RF:contact")).toBe("contact");
    expect(roofActive("room", "RF:cv")).toBe("cv");
    expect(roofActive("explore", "RF:contact")).toBeNull();
    expect(roofActive("room", "L4:talks")).toBeNull();
    expect(roofActive("room", null)).toBeNull();
  });
});

describe("RF in the tower", () => {
  it("is the roof deck, with the stops on the door pads", async () => {
    const { buildFloorLayouts } = await import("@/experience/config");
    const { ROOF_STOPS } = await import("@/experience/floors/roof/layout");
    const rf = buildFloorLayouts(8).RF;
    expect(rf).toEqual(buildRoofLayout().floor);
    expect(ROOF_STOPS).toEqual(buildRoofLayout().stops);
    expect(rf.doors?.map((d) => d.at)).toEqual([ROOF_STOPS.contact, ROOF_STOPS.cv]);
  });
});
