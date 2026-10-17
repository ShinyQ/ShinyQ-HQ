import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { buildFloorLayouts, ROVER } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import { buildNavGrid, findPath, isWalkable } from "@/experience/nav/navgrid";
import { CAR_HEADING, distanceToElevator, elevatorBeam, FAST_RETURN, isElevatorBeam, returnPad, returnPadId, returnSign, shouldBeamToCar } from "@/experience/nav/fastReturn";
import { PAD } from "@/experience/nav/pads";
import { startBeam } from "@/experience/nav/teleport";

const lift = { id: "L2" as const, approach: { x: -21, z: 0 } };

describe("the fast return rule (owner decision: beam when more than 40 u from the elevator (raised from 25 u))", () => {
  it("measures the straight line to the elevator call pad", () => {
    expect(distanceToElevator({ x: -21, z: 0 }, lift)).toBe(0);
    expect(distanceToElevator({ x: -18, z: 4 }, lift)).toBe(5);
  });

  it("drives up to 40 u and beams beyond", () => {
    expect(FAST_RETURN.beamDistance).toBe(40);
    expect(shouldBeamToCar({ x: -21 + 39.9, z: 0 }, lift)).toBe(false);
    expect(shouldBeamToCar({ x: -21 + 40, z: 0 }, lift)).toBe(false);
    expect(shouldBeamToCar({ x: -21 + 40.1, z: 0 }, lift)).toBe(true);
    expect(shouldBeamToCar({ x: -21, z: -41 }, lift)).toBe(true);
  });
});

/**
 * Everyday spots the owner wants to drive from (the reason for 40 u): the L3 deep-link spawn (the overview, about
 * 29.5 u) and the RF plaza's south-east corner (about 25.9 u). The L1 spawn (about 16.5 u) and the L2 drive keep
 * their e2e cases in e2e/fast-return.spec.ts; these two are pure layout distances.
 */
describe("everyday spots within 40 u of the elevator drive (owner decision)", () => {
  const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
  const layouts = buildFloorLayouts(data.years.length, { labs: data.labs.pods, career: careerLayoutInput(data.career), library: libraryLayoutInput(data.library) });
  const byId = (id: "L3" | "RF") => layouts[id];

  for (const { name, floor, at, min } of [
    { name: "the L3 deep-link spawn (the overview)", floor: "L3" as const, at: () => byId("L3").spawn, min: 25 },
    { name: "the RF plaza's south-east corner", floor: "RF" as const, at: () => ({ x: 8, z: 7 }), min: 25 },
  ]) {
    it(`drives from ${name}: farther than the old 25 u rule, within 40 u, on clear floor with a path to the call pad`, () => {
      const layout = byId(floor);
      const from = at();
      const d = distanceToElevator(from, layout);
      expect(d).toBeGreaterThan(min);
      expect(d).toBeLessThan(FAST_RETURN.beamDistance);
      expect(shouldBeamToCar(from, layout)).toBe(false);
      const grid = buildNavGrid(layout, ROVER.radius);
      expect(isWalkable(grid, from)).toBe(true);
      expect(findPath(grid, from, layout.approach)).not.toBeNull();
    });
  }
});

describe("the Express Return pad", () => {
  it("has the id return:<floor>", () => {
    expect(returnPadId("L2")).toBe("return:L2");
    expect(returnPadId("L3")).toBe("return:L3");
  });

  it("exists only on floors that set a returnPad coordinate", () => {
    expect(returnPad({ id: "L1" }, 0)).toBeNull();
    expect(returnPad({ id: "L2", returnPad: { x: 336, z: 8 } }, 0)).toEqual({ id: "return:L2", kind: "return", at: { x: 336, z: 8 }, face: 0 });
  });

  it("floats a 'Back to elevator' sign above its icon that fades with distance along x", () => {
    const sign = returnSign({ x: 117, z: 9 }, "Back to elevator");
    expect(sign).toMatchObject({ text: "Back to elevator", x: 117, z: 9, fadeX: 117 });
    expect(sign.y).toBeGreaterThan(PAD.iconY + PAD.iconSize / 2 + 0.5);
    expect(sign.y).toBe(FAST_RETURN.signY);
  });
});

describe("the beam to the elevator", () => {
  it("lands on the call pad facing the car", () => {
    const beam = elevatorBeam({ x: 300, z: 5 }, lift);
    expect(beam).toEqual({ pad: "elevator:L2", from: { x: 300, z: 5 }, to: { x: -21, z: 0 }, heading: CAR_HEADING, t: 0, jumped: false });
    expect(CAR_HEADING).toBe(-Math.PI / 2);
    expect(isElevatorBeam(beam)).toBe(true);
  });

  it("keeps year teleports heading east unless told otherwise", () => {
    const pad = { id: "teleport:2021", kind: "teleport" as const, at: { x: 90, z: 6.5 }, year: 2021, face: 0 };
    expect(startBeam({ x: 0, z: 0 }, pad).heading).toBe(Math.PI / 2);
    expect(startBeam({ x: 0, z: 0 }, pad, 1).heading).toBe(1);
    expect(isElevatorBeam(startBeam({ x: 0, z: 0 }, pad))).toBe(false);
  });
});
