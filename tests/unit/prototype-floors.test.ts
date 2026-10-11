import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { pathBetween } from "@/experience/nav/road";
import { buildLabsRoads } from "@/experience/prototype/labsRoads";
import { expectSpaceRules } from "../helpers/space";

const names = { L1: "Lobby", L2: "Career", L3: "Labs", L4: "Library", RF: "Roof" };
const data = buildExperienceData("en", names);

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
