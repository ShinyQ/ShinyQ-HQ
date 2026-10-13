import { describe, expect, it } from "vitest";
import { CAR_HEADING, distanceToElevator, elevatorBeam, FAST_RETURN, isElevatorBeam, returnPad, returnPadId, returnSign, shouldBeamToCar } from "@/experience/nav/fastReturn";
import { PAD } from "@/experience/nav/pads";
import { startBeam } from "@/experience/nav/teleport";

const lift = { id: "L2" as const, approach: { x: -21, z: 0 } };

describe("the fast return rule (owner decision: beam when more than about 25 u from the elevator)", () => {
  it("measures the straight line to the elevator call pad", () => {
    expect(distanceToElevator({ x: -21, z: 0 }, lift)).toBe(0);
    expect(distanceToElevator({ x: -18, z: 4 }, lift)).toBe(5);
  });

  it("drives up to 25 u and beams beyond", () => {
    expect(FAST_RETURN.beamDistance).toBe(25);
    expect(shouldBeamToCar({ x: -21 + 24.9, z: 0 }, lift)).toBe(false);
    expect(shouldBeamToCar({ x: -21 + 25, z: 0 }, lift)).toBe(false);
    expect(shouldBeamToCar({ x: -21 + 25.1, z: 0 }, lift)).toBe(true);
    expect(shouldBeamToCar({ x: -21, z: -26 }, lift)).toBe(true);
  });
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
