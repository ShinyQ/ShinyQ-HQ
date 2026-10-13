import { afterEach, describe, expect, it } from "vitest";
import { markOnce, markTime, PERF_MARKS } from "@/lib/perf-marks";

afterEach(() => performance.clearMarks());

describe("perf marks", () => {
  it("writes each mark once per page load and reads its time", () => {
    expect(markTime(PERF_MARKS.firstFrame)).toBeNull();
    markOnce(PERF_MARKS.firstFrame);
    const first = markTime(PERF_MARKS.firstFrame);
    expect(first).toBeTypeOf("number");
    markOnce(PERF_MARKS.firstFrame);
    expect(performance.getEntriesByName(PERF_MARKS.firstFrame, "mark")).toHaveLength(1);
    expect(markTime(PERF_MARKS.firstFrame)).toBe(first);
  });

  it("keeps the release reason as the mark detail", () => {
    markOnce(PERF_MARKS.bootRelease, "timeout");
    expect((performance.getEntriesByName(PERF_MARKS.bootRelease, "mark")[0] as PerformanceMark).detail).toBe("timeout");
  });

  it("uses the hq: names the timeline spec reads", () => {
    expect(Object.values(PERF_MARKS)).toEqual(["hq:boot-release", "hq:first-frame", "hq:intro-start", "hq:intro-end", "hq:explore", "hq:first-drawer"]);
  });
});
