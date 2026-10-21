import { describe, expect, it } from "vitest";
import { PROGRAM_SETTLE, programSettleMs } from "../../e2e/budgets";

describe("programSettleMs", () => {
  it("keeps the floor while frames are fast", () => {
    expect(programSettleMs(0)).toBe(PROGRAM_SETTLE.floorMs);
    expect(programSettleMs(16)).toBe(PROGRAM_SETTLE.floorMs);
    expect(programSettleMs(400, 120_000)).toBe(120_000);
  });

  it("allows the set number of windows at the measured frame time", () => {
    // The slow CI runner: about 1.6 s a frame, so one 60-frame window takes about 96 s.
    expect(programSettleMs(1_600)).toBe(PROGRAM_SETTLE.windows * PROGRAM_SETTLE.frames * 1_600);
    expect(programSettleMs(1_600)).toBeGreaterThan(2 * 96_000);
  });

  it("stops at the hard ceiling so a hung page still fails", () => {
    expect(programSettleMs(10_000)).toBe(PROGRAM_SETTLE.ceilingMs);
    expect(programSettleMs(Number.POSITIVE_INFINITY)).toBe(PROGRAM_SETTLE.ceilingMs);
    expect(programSettleMs(10_000, 400_000)).toBe(400_000);
  });
});
