import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { buildFloorLayouts, FLOOR_IDS, ROVER } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { expectPadRules, expectSpaceRules } from "../helpers/space";

const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
const layouts = buildFloorLayouts(data.years.length, { labs: data.labs.pods, career: careerLayoutInput(data.career), library: libraryLayoutInput(data.library) });

describe("floor pads in the real layouts", () => {
  it("gives every floor one elevator call pad on its approach, 3 u in front of the shaft door", () => {
    for (const id of FLOOR_IDS) {
      const l = layouts[id];
      const lifts = (l.pads ?? []).filter((p) => p.kind === "elevator");
      expect(lifts.map((p) => p.id), id).toEqual([`elevator:${id}`]);
      expect(lifts[0].at, id).toEqual(l.approach);
      expect(lifts[0].at.z, id).toBe(l.door.z);
      expect(lifts[0].at.x - l.door.x, id).toBe(3);
    }
  });

  it("adds one teleporter per year on L2 only", () => {
    expect(layouts.L2.pads?.filter((p) => p.kind === "teleport").map((p) => p.year)).toEqual(data.years);
    for (const id of ["L1", "L3", "L4", "RF"] as const) expect(layouts[id].pads?.some((p) => p.kind === "teleport"), id).toBe(false);
  });

  it("keeps every pad on walkable floor and inside the pad rules", () => {
    for (const id of FLOOR_IDS) {
      const l = layouts[id];
      const grid = buildNavGrid(l, ROVER.radius);
      for (const pad of l.pads ?? []) expect(isWalkable(grid, pad.at), pad.id).toBe(true);
      expectPadRules({ bounds: l.bounds, obstacles: l.obstacles, doors: l.doors ?? [], network: l.road, start: l.approach, pads: l.pads ?? [] });
    }
  });

  it("keeps the road floors inside the full space rules with their pads", () => {
    for (const id of ["L2", "L3", "L4"] as const) {
      const l = layouts[id];
      expectSpaceRules({ bounds: l.bounds, obstacles: l.obstacles, doors: l.doors ?? [], network: l.road!, start: l.approach, pads: l.pads });
    }
  });

  it("keeps the placeholder corridor (no career data) with its elevator pad", () => {
    expect(buildFloorLayouts(8).L2.pads?.map((p) => p.id)).toEqual(["elevator:L2"]);
  });
});
