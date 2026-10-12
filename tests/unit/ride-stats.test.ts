import { describe, expect, it } from "vitest";
import { PREPARE_TIMEOUT } from "@/experience/tower/elevator";
import { finishRideStats, formatRideSummary, startRideStats, stepRideStats } from "@/experience/tower/rideStats";

function sampleRide(held: number) {
  const stats = startRideStats("L1", "L3", 28);
  stepRideStats(stats, { stage: "boarding", y: 0, frameDt: 0.016, held: 0, programs: 40 });
  stepRideStats(stats, { stage: "closing", y: 0, frameDt: 0.3, held, programs: 52 });
  [0, 1, 4, 10, 18, 24, 27].forEach((y, i) => stepRideStats(stats, { stage: "moving", y, frameDt: 0.016, held, programs: i >= 3 ? 53 : 52 }));
  stepRideStats(stats, { stage: "opening", y: 28, frameDt: 0.016, held, programs: 53 });
  return finishRideStats(stats, 53);
}

describe("ride stats", () => {
  it("counts dolly frames, car heights, the biggest jump and the shaders linked while moving", () => {
    const s = sampleRide(0.3);
    expect(s).toMatchObject({ from: "L1", to: "L3", frames: 10, dollyFrames: 7, distinctY: 7, timedOut: false, programs: 1 });
    expect(s.held).toBeCloseTo(0.3);
    expect(s.maxStep).toBeCloseTo(8 / 28);
    expect(s.longestFrameMs).toBeCloseTo(300);
    expect(s.elapsedMs).toBeCloseTo(9 * 16 + 300);
  });

  it("flags a wait that hit the timeout", () => {
    expect(sampleRide(PREPARE_TIMEOUT).timedOut).toBe(true);
  });

  it("prints one console line", () => {
    expect(formatRideSummary(sampleRide(0.3))).toBe(
      "[hq ride] L1 to L3: 7 dolly frames, 7 car heights, biggest jump 29% of the trip, longest frame 300 ms, waited 0.30 s, 1 shaders compiled while moving, 0.44 s in total",
    );
  });
});
