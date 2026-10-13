import { afterEach, describe, expect, it, vi } from "vitest";
import { STATS_FIXTURE } from "@/lib/visits/contract";
import { __setStatsForTests, requestStats, statsState } from "@/lib/visits/store";

const HOUR = 3_600_000;
const updated = Date.parse(STATS_FIXTURE.updatedAt);
const json = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => __setStatsForTests(null));

describe("requestStats", () => {
  it("validates a fresh snapshot and fetches once per page", async () => {
    const fetcher = vi.fn(async () => json(STATS_FIXTURE));
    const [a, b] = await Promise.all([requestStats(fetcher, () => updated + HOUR), requestStats(fetcher, () => updated + HOUR)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toEqual(["/api/stats", expect.objectContaining({ credentials: "omit" })]);
    expect(a).toBe(b);
    expect(a).toMatchObject({ status: "ready", freshness: "fresh" });
    expect(statsState().snapshot).toEqual(STATS_FIXTURE);
  });

  it("marks a snapshot older than 48 hours as delayed", async () => {
    expect(await requestStats(async () => json(STATS_FIXTURE), () => updated + 72 * HOUR)).toMatchObject({ status: "ready", freshness: "delayed" });
  });

  it.each([
    ["older than 7 days", async () => json(STATS_FIXTURE), updated + 8 * 24 * HOUR],
    ["204 (no snapshot or kill switch)", async () => json(null, 204), updated],
    ["a server error", async () => json({}, 500), updated],
    ["an invalid body", async () => json({ v: 1, empty: true }), updated],
    ["bad JSON", async () => new Response("<html>", { status: 200 }), updated],
    ["a network error", async () => Promise.reject(new TypeError("offline")), updated],
  ])("hides on %s", async (_, fetcher, now) => {
    expect(await requestStats(fetcher as typeof fetch, () => now)).toEqual({ status: "hidden", snapshot: null, freshness: "hidden" });
  });
});
