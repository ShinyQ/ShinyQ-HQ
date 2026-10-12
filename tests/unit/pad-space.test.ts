import { describe, expect, it } from "vitest";
import type { RoadNetwork } from "@/experience/nav/road";
import { padViolations, spaceViolations } from "@/experience/nav/space";
import type { DoorTrigger, PadTrigger, Rect } from "@/experience/types";
import { expectPadRules } from "../helpers/space";

const v = (x: number, z: number) => ({ x, z });
const network: RoadNetwork = {
  roads: [{ id: "main", points: [v(0, 0), v(60, 0)], width: 8 }],
  plazas: [{ id: "p", center: v(30, 0), w: 20, d: 18 }],
  spurs: [{ room: "L2:a", from: v(30, 0), to: v(30, -10.2) }],
};
const base = {
  bounds: { minX: -4, maxX: 64, minZ: -20, maxZ: 20 } as Rect,
  obstacles: [{ minX: 29, maxX: 31, minZ: -16, maxZ: -14 }] as Rect[],
  doors: [{ room: "L2:a", at: v(30, -10.2), facing: v(0, -1) }] as DoorTrigger[],
  network,
  start: v(0, 0),
};
const pad = (id: string, x: number, z: number, kind: PadTrigger["kind"] = "teleport"): PadTrigger => ({ id, kind, at: v(x, z), face: 0 });
const rules = (pads: PadTrigger[]) => padViolations({ ...base, pads }).map((x) => x.rule);

describe("pad space rules", () => {
  it("passes a pad beside the road and one on the road's dead end (the elevator approach)", () => {
    expectPadRules({ ...base, pads: [pad("elevator:L2", 0, 0, "elevator"), pad("teleport:2021", 23.5, 6.5)] });
  });

  it("flags a pad on the driving width of a road", () => {
    expect(rules([pad("t", 20, 3)])).toEqual(["pad-road"]);
  });

  it("flags a pad on a door pad or a spur", () => {
    expect(rules([pad("t", 30, -10.2)])).toEqual(expect.arrayContaining(["pad-door", "pad-spur"]));
    expect(rules([pad("t", 31.5, -7)])).toContain("pad-spur");
  });

  it("flags a pad the rover cannot park on (next to an obstacle) or one off the slab", () => {
    expect(rules([pad("t", 33, -15)])).toContain("pad-blocked");
    expect(rules([pad("t", 63, 10)])).toContain("pad-bounds");
  });

  it("flags a pad behind a gap narrower than 6 u", () => {
    const wall: Rect[] = [
      { minX: 40, maxX: 64, minZ: 10, maxZ: 10.5 },
      { minX: 36, maxX: 40, minZ: 10, maxZ: 20 },
    ];
    const found = padViolations({ ...base, obstacles: [...base.obstacles, ...wall], pads: [pad("t", 50, 16)] }).map((x) => x.rule);
    expect(found).toContain("pad-gap");
  });

  it("runs inside spaceViolations when a layout lists its pads", () => {
    expect(spaceViolations({ ...base, pads: [pad("t", 20, 3)] }).map((x) => x.rule)).toContain("pad-road");
  });
});
