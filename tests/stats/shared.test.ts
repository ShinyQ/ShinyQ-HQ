import { describe, expect, it } from "vitest";
import { floorOfPath } from "@/lib/stats/floors";
import { parseVisitPayload, visitDataPoint, visitSource, VISIT_INTENTS, VISIT_MAX_BYTES, VISIT_SOURCES } from "@/lib/stats/visit";

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
    expect(JSON.stringify({ v: 1, kind: "visit", src: "mail" }).length).toBe(35);
    expect(35).toBeLessThan(VISIT_MAX_BYTES / 3);
  });

  it("accepts the visit ping with an allowlisted channel tag and the intent ping", () => {
    for (const src of VISIT_SOURCES) expect(parseVisitPayload({ v: 1, kind: "visit", src })).toEqual({ v: 1, kind: "visit", src });
    for (const intent of VISIT_INTENTS) expect(parseVisitPayload({ v: 1, intent })).toEqual({ v: 1, intent });
  });

  it.each([{ v: 1, kind: "visit", src: "twitter" }, { v: 1, kind: "visit", src: "" }, { v: 1, kind: "visit", src: 1 }, { v: 1, intent: "phone" }, { v: 1, intent: "cv", src: "li" }, { v: 1, kind: "visit", intent: "cv" }])("rejects %j", (value) => {
    expect(parseVisitPayload(value)).toBeNull();
  });

  it("writes the tag and the intent into blob3, and nothing new for an untagged visit", () => {
    expect(visitDataPoint({ v: 1, kind: "visit" })).toEqual({ blobs: ["1", "visit"], doubles: [1], indexes: ["visit"] });
    expect(visitDataPoint({ v: 1, kind: "visit", src: "li" })).toEqual({ blobs: ["1", "visit", "li"], doubles: [1], indexes: ["visit"] });
    expect(visitDataPoint({ v: 1, intent: "cv" })).toEqual({ blobs: ["1", "intent", "cv"], doubles: [1], indexes: ["visit"] });
  });

  it("reads only an allowlisted ?src= tag", () => {
    expect(visitSource("?src=li")).toBe("li");
    expect(visitSource("?tier=lite&src=gh&view=classic")).toBe("gh");
    expect(visitSource("?src=evil")).toBeUndefined();
    expect(visitSource("?source=li")).toBeUndefined();
    expect(visitSource("")).toBeUndefined();
  });
});
