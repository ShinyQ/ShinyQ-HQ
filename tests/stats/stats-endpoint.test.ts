import { describe, expect, it } from "vitest";
import { STATS_FIXTURE, STATS_FIXTURE_PERF } from "@/lib/stats/fixtures";
import { STATS_KEY } from "@/lib/stats/protocol";
import { createStatsHandler } from "../../functions/_lib/stats";
import type { KvNamespace, StatsEnv } from "../../functions/_lib/types";

const ORIGIN = "https://kurniadi.pages.dev";

function kvWith(value: string | null, onGet?: (key: string, options?: { cacheTtl?: number }) => void): KvNamespace {
  return {
    async get(key, options) {
      onGet?.(key, options);
      return key === STATS_KEY ? value : null;
    },
    async put() {
      throw new Error("read only");
    },
  };
}

function call(env: StatsEnv, init: { method?: string; headers?: Record<string, string> } = {}) {
  const handler = createStatsHandler();
  return handler({ request: new Request(`${ORIGIN}/api/stats`, { method: init.method ?? "GET", headers: init.headers }), env, waitUntil: () => undefined });
}

describe("GET /api/stats", () => {
  it("serves the stored snapshot with cache headers and an ETag", async () => {
    const reads: { key: string; options?: { cacheTtl?: number } }[] = [];
    const res = await call({ STATS_ENABLED: "true", STATS_KV: kvWith(JSON.stringify(STATS_FIXTURE), (key, options) => reads.push({ key, options })) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600, stale-while-revalidate=86400");
    expect(res.headers.get("ETag")).toMatch(/^"[0-9a-f]{32}"$/);
    expect(await res.json()).toEqual(STATS_FIXTURE);
    expect(reads).toEqual([{ key: STATS_KEY, options: { cacheTtl: 300 } }]);
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
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
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
