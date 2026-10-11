import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { onNetwork, pathBetween } from "@/experience/nav/road";
import { buildCareerRoad, plazaLength } from "@/experience/prototype/careerRoad";
import { buildLabsRoads } from "@/experience/prototype/labsRoads";
import { expectSpaceRules } from "../helpers/space";

const names = { L1: "Lobby", L2: "Career", L3: "Labs", L4: "Library", RF: "Roof" };
const data = buildExperienceData("en", names);

describe("L2 Career Road prototype", () => {
  for (const style of ["straight", "meander"] as const) {
    const road = buildCareerRoad(careerLayoutInput(data.career), style);

    it(`${style}: passes the space rules with the real career data`, () => {
      expectSpaceRules({ bounds: road.bounds, obstacles: road.obstacles, doors: road.doors, network: road.network, start: road.approach });
    });

    it(`${style}: keeps x increasing along the road (rail camera and scrubbing)`, () => {
      const xs = road.network.roads[0].points.map((p) => p.x);
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
      expect(road.stops).toEqual([...road.stops].sort((a, b) => a - b));
    });

    it(`${style}: docks every room in one row with a spur, and routes along the road`, () => {
      expect(road.rooms).toHaveLength(data.career.years.reduce((n, y) => n + y.entries.length, 0));
      for (const r of road.rooms) expect(road.network.spurs.some((s) => s.room === r.id)).toBe(true);
      const first = road.rooms[0];
      const last = road.rooms[road.rooms.length - 1];
      const path = pathBetween(road.network, first.at, last.at)!;
      for (const p of path) expect(onNetwork(road.network, p)).toBe(true);
    });
  }

  it("sizes plazas by entry count", () => {
    expect(plazaLength(1)).toBe(16);
    expect(plazaLength(8)).toBeGreaterThan(plazaLength(4));
    const road = buildCareerRoad(careerLayoutInput(data.career), "straight");
    const busiest = road.years.reduce((a, b) => (b.rooms.length > a.rooms.length ? b : a));
    expect(busiest.plaza.w).toBe(plazaLength(busiest.rooms.length));
  });
});

describe("L3 Project Roads prototype", () => {
  const labs = buildLabsRoads(data.labs.pods);

  it("passes the space rules with the real pods", () => {
    expectSpaceRules({ bounds: labs.bounds, obstacles: labs.obstacles, doors: labs.doors, network: labs.network, start: labs.approach });
  });

  it("has a hub of at least 20 u and wing roads that meet in a loop", () => {
    expect(labs.hub.w).toBeGreaterThanOrEqual(20);
    const [, north, south] = labs.network.roads;
    expect(north.points.at(-1)).toEqual(south.points.at(-1));
    // Both ways round the loop exist: a pod at the far end of one wing is reachable from the other wing's end.
    expect(pathBetween(labs.network, labs.loopEnd, labs.hub.center)).not.toBeNull();
  });

  it("places hero and featured pods, and leaves listed pods in the directories", () => {
    const tours = data.labs.pods.filter((p) => p.tier !== "listed");
    expect(labs.pods).toHaveLength(tours.length);
    expect(labs.directory.software.length + labs.directory.ai.length).toBe(data.labs.pods.length - tours.length);
  });
});
