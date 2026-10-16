import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { buildFloorLayouts, FLOOR_IDS, ROVER } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import { distanceToElevator, FAST_RETURN, shouldBeamToCar } from "@/experience/nav/fastReturn";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { PAD } from "@/experience/nav/pads";
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

  it("adds one Express Return pad on L2, L3 and L4, right after the elevator pad, far from the elevator", () => {
    for (const id of ["L2", "L3", "L4"] as const) {
      const l = layouts[id];
      const returns = (l.pads ?? []).filter((p) => p.kind === "return");
      expect(returns.map((p) => p.id), id).toEqual([`return:${id}`]);
      expect(l.pads?.[1]?.id, id).toBe(`return:${id}`);
      expect(returns[0].at, id).toEqual(l.returnPad);
      expect(distanceToElevator(returns[0].at, l), id).toBeGreaterThan(FAST_RETURN.beamDistance);
    }
    for (const id of ["L1", "RF"] as const) expect(layouts[id].pads?.some((p) => p.kind === "return"), id).toBe(false);
  });

  it("drives from the everyday spots and beams only from the far ends (owner decision: 40 u)", () => {
    expect(FAST_RETURN.beamDistance).toBe(40);
    // Drive: the L1 spawn (in front of the Ask Rover kiosk since 2026-10-14, about 16.5 u) and every floor's
    // arrival spot (Round 8 J: on the main axis east of the approach, the L2 arrival and the L3 overview 27 u and 29.5 u out).
    expect(shouldBeamToCar(layouts.L1.spawn, layouts.L1)).toBe(false);
    expect(distanceToElevator(layouts.L1.spawn, layouts.L1)).toBeGreaterThan(10);
    for (const id of FLOOR_IDS) expect(shouldBeamToCar(layouts[id].arrival!, layouts[id]), id).toBe(false);
    expect(distanceToElevator(layouts.L3.arrival!, layouts.L3)).toBeGreaterThan(25);
    expect(distanceToElevator(layouts.L2.arrival!, layouts.L2)).toBeGreaterThan(25);
    // Beam: the L2 annex and the L3 east plaza (their Return pads), and the deep L4 stations.
    for (const id of ["L2", "L3"] as const) expect(shouldBeamToCar(layouts[id].returnPad!, layouts[id]), id).toBe(true);
    expect((layouts.L4.doors ?? []).some((d) => shouldBeamToCar(d.at, layouts.L4))).toBe(true);
  });

  it("keeps the L3 Return pad off the reactor ring road", () => {
    const l = layouts.L3;
    const ring = l.road!.roads.find((r) => r.id === "east-ring")!;
    const center = l.road!.plazas.find((p) => p.id === "east")!.center;
    const outer = Math.max(...ring.points.map((p) => Math.hypot(p.x - center.x, p.z - center.z))) + ring.width / 2;
    expect(Math.hypot(l.returnPad!.x - center.x, l.returnPad!.z - center.z)).toBeGreaterThan(outer + PAD.radius);
  });

  it("keeps the placeholder corridor (no career data) with its elevator pad", () => {
    expect(buildFloorLayouts(8).L2.pads?.map((p) => p.id)).toEqual(["elevator:L2"]);
  });
});
