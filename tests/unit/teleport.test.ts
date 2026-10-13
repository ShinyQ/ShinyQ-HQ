import { describe, expect, it } from "vitest";
import { advanceBeam, BEAM, beamDuration, beamGlow, beamJumpAt, startBeam } from "@/experience/nav/teleport";
import { REDUCED_CUT } from "@/experience/tower/elevator";
import type { PadTrigger } from "@/experience/types";

const target: PadTrigger = { id: "teleport:2023", kind: "teleport", at: { x: 140, z: -0.5 }, year: 2023, face: 0 };

describe("teleport beam", () => {
  it("starts at the rover and targets the pad, facing forward in time", () => {
    expect(startBeam({ x: -7.5, z: 6.5 }, target)).toEqual({
      pad: "teleport:2023",
      from: { x: -7.5, z: 6.5 },
      to: { x: 140, z: -0.5 },
      heading: Math.PI / 2,
      t: 0,
      jumped: false,
    });
  });

  it("rises, jumps once, then fades and ends", () => {
    let step = advanceBeam(startBeam({ x: 0, z: 0 }, target), BEAM.out - 0.05, false);
    expect(step.jump).toBe(false);
    step = advanceBeam(step.beam!, 0.1, false);
    expect(step.jump).toBe(true);
    expect(step.beam?.jumped).toBe(true);
    step = advanceBeam(step.beam!, 0.1, false);
    expect(step.jump).toBe(false);
    step = advanceBeam(step.beam!, BEAM.in, false);
    expect(step.beam).toBeNull();
    expect(beamDuration(false)).toBeCloseTo(BEAM.out + BEAM.in);
  });

  it("cuts in 150 ms under reduced motion, jumping halfway, even within one long frame", () => {
    expect(beamDuration(true)).toBe(REDUCED_CUT);
    expect(beamJumpAt(true)).toBe(REDUCED_CUT / 2);
    expect(advanceBeam(startBeam({ x: 0, z: 0 }, target), 0.25, true)).toEqual({ beam: null, jump: true });
  });

  it("draws a column at the origin while rising and at the target while fading, none under reduced motion", () => {
    const beam = startBeam({ x: 1, z: 2 }, target);
    const early = beamGlow({ ...beam, t: BEAM.out / 2 }, false)!;
    expect(early.at).toEqual({ x: 1, z: 2 });
    expect(early.level).toBeCloseTo(0.5);
    const late = beamGlow({ ...beam, t: BEAM.out + BEAM.in / 2, jumped: true }, false)!;
    expect(late.at).toEqual(target.at);
    expect(late.level).toBeCloseTo(0.5);
    expect(beamGlow(beam, true)).toBeNull();
    expect(beamGlow(null, false)).toBeNull();
  });
});
