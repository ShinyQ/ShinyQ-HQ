import { beforeEach, describe, expect, it } from "vitest";
import { STATS_FIXTURE, STATS_FIXTURE_PERF } from "@/lib/stats/fixtures";
import { STATS_KEY } from "@/lib/stats/protocol";
import { STATS_LIVE_KEY } from "@/lib/stats/live";
import { createStatsHandler, LIVE_MAX_DELTA, LIVE_TIMEOUT_MS, resetLiveCounts } from "../../functions/_lib/stats";
import type { KvNamespace, ServiceBinding, StatsEnv } from "../../functions/_lib/types";

const ORIGIN = "https://kurniadi.pages.dev";

function kvWith(value: string | null, onGet?: (key: string, options?: { cacheTtl?: number }) => void, live: string | null = null): KvNamespace {
  return {
    async get(key, options) {
      onGet?.(key, options);
      return key === STATS_KEY ? value : key === STATS_LIVE_KEY ? live : null;
    },
    async put() {
      throw new Error("read only");
    },
  };
}

function call(env: StatsEnv, init: { method?: string; headers?: Record<string, string> } = {}, now = Date.parse("2026-10-24T09:30:00Z")) {
  const handler = createStatsHandler({ now: () => now });
  return handler({ request: new Request(`${ORIGIN}/api/stats`, { method: init.method ?? "GET", headers: init.headers }), env, waitUntil: () => undefined });
}

beforeEach(() => resetLiveCounts());

describe("GET /api/stats", () => {
  it("serves the stored snapshot with cache headers and an ETag", async () => {
    const reads: { key: string; options?: { cacheTtl?: number } }[] = [];
    const res = await call({ STATS_ENABLED: "true", STATS_KV: kvWith(JSON.stringify(STATS_FIXTURE), (key, options) => reads.push({ key, options })) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=30, stale-while-revalidate=30");
    expect(res.headers.get("ETag")).toMatch(/^"[0-9a-f]{32}"$/);
    expect(await res.json()).toEqual(STATS_FIXTURE);
    expect(reads).toEqual([
      { key: STATS_KEY, options: { cacheTtl: 60 } },
      { key: STATS_LIVE_KEY, options: { cacheTtl: 60 } },
    ]);
  });

  it("answers 304 when the ETag matches", async () => {
    const env = { STATS_ENABLED: "true", STATS_KV: kvWith(JSON.stringify(STATS_FIXTURE)) };
    const etag = (await call(env)).headers.get("ETag") as string;
    const res = await call(env, { headers: { "If-None-Match": etag } });
    expect(res.status).toBe(304);
    expect(res.headers.get("ETag")).toBe(etag);
    expect(await res.text()).toBe("");
  });

  it("answers HEAD like GET without a body", async () => {
    const res = await call({ STATS_ENABLED: "true", STATS_KV: kvWith(JSON.stringify(STATS_FIXTURE)) }, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  it("answers 204 when off, unbound, missing, broken or invalid", async () => {
    const cases: StatsEnv[] = [
      { STATS_ENABLED: "false", STATS_KV: kvWith(JSON.stringify(STATS_FIXTURE)) },
      { STATS_KV: kvWith(JSON.stringify(STATS_FIXTURE)) },
      { STATS_ENABLED: "true" },
      { STATS_ENABLED: "true", STATS_KV: kvWith(null) },
      { STATS_ENABLED: "true", STATS_KV: kvWith("{") },
      { STATS_ENABLED: "true", STATS_KV: kvWith(JSON.stringify({ ...STATS_FIXTURE, v: 2 })) },
      {
        STATS_ENABLED: "true",
        STATS_KV: {
          get: async () => {
            throw new Error("kv down");
          },
          put: async () => {},
        },
      },
    ];
    for (const env of cases) {
      const res = await call(env);
      expect(res.status).toBe(204);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
      expect(await res.text()).toBe("");
    }
  });

  it("strips anything the stored value adds beyond the contract", async () => {
    const res = await call({ STATS_ENABLED: "true", STATS_KV: kvWith(JSON.stringify(STATS_FIXTURE)) });
    expect(Object.keys(await res.json()).sort()).toEqual(Object.keys(STATS_FIXTURE).sort());
  });

  it("serves the perf block intact when the snapshot has one", async () => {
    const res = await call({ STATS_ENABLED: "true", STATS_KV: kvWith(JSON.stringify(STATS_FIXTURE_PERF)) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(STATS_FIXTURE_PERF);
  });

  it("answers 405 to other methods", async () => {
    const res = await call({ STATS_ENABLED: "true", STATS_KV: kvWith(null) }, { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD");
  });
});

describe("GET /api/stats live visits (owner decision 2026-10-24)", () => {
  const live = (over: Record<string, unknown> = {}) => JSON.stringify({ v: 1, updatedAt: STATS_FIXTURE.updatedAt, from: "2026-10-24T00:00:00Z", visits: 3, ...over });
  function binding(answer: () => Promise<Response> | Response) {
    const urls: string[] = [];
    const stats: ServiceBinding = {
      fetch: async (input) => {
        urls.push(String(input));
        return answer();
      },
    };
    return { stats, urls };
  }
  const envWith = (stats: ServiceBinding | undefined, liveValue: string | null = live()): StatsEnv => ({ STATS_ENABLED: "true", STATS_KV: kvWith(JSON.stringify(STATS_FIXTURE), undefined, liveValue), STATS: stats });

  it("adds the pings that arrived since the hourly run to both periods", async () => {
    const { stats, urls } = binding(() => Response.json({ n: 5 }));
    const body = await (await call(envWith(stats))).json();
    expect(body.visits).toEqual({ d30: STATS_FIXTURE.visits.d30 + 2, all: STATS_FIXTURE.visits.all + 2 });
    expect({ ...body, visits: STATS_FIXTURE.visits }).toEqual(STATS_FIXTURE);
    expect(urls).toEqual(["https://hq-stats/live?from=2026-10-24T00%3A00%3A00Z"]);
  });

  it("reuses a live count for 30 seconds per isolate", async () => {
    const { stats, urls } = binding(() => Response.json({ n: 5 }));
    await call(envWith(stats));
    await call(envWith(stats), {}, Date.parse("2026-10-24T09:30:20Z"));
    expect(urls).toHaveLength(1);
    await call(envWith(stats), {}, Date.parse("2026-10-24T09:31:00Z"));
    expect(urls).toHaveLength(2);
  });

  it("serves the snapshot as it is when the live part is missing, stale, failing, slow or out of bounds", async () => {
    const cases: StatsEnv[] = [
      envWith(undefined),
      envWith(binding(() => Response.json({ n: 5 })).stats, null),
      envWith(binding(() => Response.json({ n: 5 })).stats, live({ updatedAt: "2026-10-01T00:00:00.000Z" })),
      envWith(binding(() => Response.json({ n: 5 })).stats, live({ from: null })),
      envWith(binding(() => Response.json({ n: 5 })).stats, live({ extra: 1 })),
      envWith(binding(() => new Response("down", { status: 502 })).stats),
      envWith(binding(() => Response.json({ n: "5" })).stats),
      envWith(binding(() => Response.json({ n: 1 })).stats),
      envWith(binding(() => Response.json({ n: 3 + LIVE_MAX_DELTA + 1 })).stats),
      envWith(
        binding(() => {
          throw new Error("no such worker");
        }).stats,
      ),
    ];
    for (const env of cases) {
      resetLiveCounts();
      const res = await call(env);
      expect(res.status).toBe(200);
      expect((await res.json()).visits).toEqual(STATS_FIXTURE.visits);
    }
  });

  it("gives up on a slow Worker after the timeout", async () => {
    const { stats } = binding(() => new Promise<Response>((resolve) => setTimeout(() => resolve(Response.json({ n: 9 })), LIVE_TIMEOUT_MS + 500)));
    const started = Date.now();
    const body = await (await call(envWith(stats))).json();
    expect(body.visits).toEqual(STATS_FIXTURE.visits);
    expect(Date.now() - started).toBeLessThan(LIVE_TIMEOUT_MS + 400);
  });
});
