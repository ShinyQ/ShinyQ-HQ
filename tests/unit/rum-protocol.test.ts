import { describe, expect, it } from "vitest";
import { fpsBucket, parseRumPayload, rumDataPoint, RUM_MAX_BYTES, timeBucket, type RumPayload } from "@/lib/rum/protocol";

const valid: RumPayload = { v: 1, tier: "lite", path: "cover", fps50: "55+", fps10: "30-44", explore: "5-8s", lost: 0, timeout: 0 };

describe("RUM protocol", () => {
  it("accepts exactly the allowlisted object", () => {
    expect(parseRumPayload(valid)).toEqual(valid);
    expect(parseRumPayload(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
  });

  it("rejects extra, missing or out-of-list fields", () => {
    expect(parseRumPayload({ ...valid, ua: "Mozilla/5.0" })).toBeNull();
    const missing = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== "explore"));
    expect(parseRumPayload(missing)).toBeNull();
    expect(parseRumPayload({ ...valid, v: 2 })).toBeNull();
    expect(parseRumPayload({ ...valid, tier: "static" })).toBeNull();
    expect(parseRumPayload({ ...valid, path: "/en/labs/x" })).toBeNull();
    expect(parseRumPayload({ ...valid, fps50: 58 })).toBeNull();
    expect(parseRumPayload({ ...valid, explore: "4s" })).toBeNull();
    expect(parseRumPayload({ ...valid, lost: true })).toBeNull();
    expect(parseRumPayload({ ...valid, timeout: 2 })).toBeNull();
    expect(parseRumPayload(null)).toBeNull();
    expect(parseRumPayload([valid])).toBeNull();
    expect(parseRumPayload("x")).toBeNull();
  });

  it("buckets FPS and times at their edges", () => {
    expect([null, 0, 14.9, 15, 24.9, 25, 29.9, 30, 44.9, 45, 54.9, 55, 120].map(fpsBucket)).toEqual(["na", "na", "lt15", "15-24", "15-24", "25-29", "25-29", "30-44", "30-44", "45-54", "45-54", "55+", "55+"]);
    expect([null, -1, 2999, 3000, 4999, 5000, 7999, 8000, 11_999, 12_000, 19_999, 20_000].map(timeBucket)).toEqual(["na", "na", "lt3s", "3-5s", "3-5s", "5-8s", "5-8s", "8-12s", "8-12s", "12-20s", "12-20s", "20s+"]);
  });

  it("maps a payload to one Analytics Engine point with fixed positions", () => {
    expect(rumDataPoint({ ...valid, lost: 1 })).toEqual({ blobs: ["1", "lite", "cover", "55+", "30-44", "5-8s"], doubles: [1, 0, 1], indexes: ["lite"] });
  });

  it("fits the largest payload far under the size limit", () => {
    const largest: RumPayload = { v: 1, tier: "full", path: "deeplink", fps50: "45-54", fps10: "45-54", explore: "12-20s", lost: 1, timeout: 1 };
    expect(JSON.stringify(largest).length).toBeLessThan(RUM_MAX_BYTES / 2);
  });
});
