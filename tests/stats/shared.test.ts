import { describe, expect, it } from "vitest";
import { floorOfPath } from "@/lib/stats/floors";
import { parseVisitPayload, visitDataPoint, VISIT_MAX_BYTES } from "@/lib/stats/visit";

describe("floorOfPath", () => {
  it.each([
    ["/en", "L1"],
    ["/id/", "L1"],
    ["/en/journey", "L2"],
    ["/id/journey/metrodata-2026", "L2"],
    ["/en/labs", "L3"],
    ["/en/labs/voice-ai-contact-center", "L3"],
    ["/en/library", "L4"],
    ["/en/blog/some-post", "L4"],
    ["/en/contact", "RF"],
  ])("maps %s to %s", (path, floor) => {
    expect(floorOfPath(path)).toBe(floor);
  });

  it.each(["/", "/en/quick", "/en/cv", "/fr/labs", "/en/labs/a/b", "/en/data/rooms/en.json", "", "/en/labs/Bad_Slug"])("has no floor for %s", (path) => {
    expect(floorOfPath(path)).toBeNull();
  });
});

describe("visit beacon payload", () => {
  it("accepts exactly the allowlisted object", () => {
    for (const mode of ["3d", "classic", "both"] as const) expect(parseVisitPayload({ v: 1, mode })).toEqual({ v: 1, mode });
  });

  it.each([null, [], "x", {}, { v: 1 }, { v: 2, mode: "3d" }, { v: 1, mode: "vr" }, { v: 1, mode: "3d", floor: "L1" }, { v: "1", mode: "3d" }])("rejects %j", (value) => {
    expect(parseVisitPayload(value)).toBeNull();
  });

  it("writes one point with a constant index and no identifier", () => {
    expect(visitDataPoint({ v: 1, mode: "both" })).toEqual({ blobs: ["1", "both"], doubles: [1], indexes: ["visit"] });
  });

  it("keeps the largest payload far under the size cap", () => {
    expect(JSON.stringify({ v: 1, mode: "classic" }).length).toBeLessThan(VISIT_MAX_BYTES / 4);
  });
});
