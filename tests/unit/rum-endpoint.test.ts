import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { createRumHandler, resetRumWindow, RUM_ISOLATE_CAP } from "../../functions/_lib/rum";
import type { AnalyticsEngineDataset, RumEnv } from "../../functions/_lib/types";

const ORIGIN = "https://kurniadi.pages.dev";
const PAYLOAD = { v: 1, tier: "full", path: "cover", fps50: "55+", fps10: "45-54", explore: "5-8s", lost: 0, timeout: 0 };

function setup(env: Partial<RumEnv> = {}) {
  const points: Parameters<AnalyticsEngineDataset["writeDataPoint"]>[0][] = [];
  const fullEnv: RumEnv = { RUM_ENABLED: "true", ASK_ALLOWED_ORIGINS: `${ORIGIN},https://kurniadi.dev`, PERF_EVENTS: { writeDataPoint: (p) => points.push(p) }, ...env };
  const handler = createRumHandler({ now: () => Date.UTC(2026, 9, 13, 3, 0, 0) });
  const post = (body: string, headers: Record<string, string> = {}) =>
    handler({
      request: new Request(`${ORIGIN}/api/rum`, {
        method: "POST",
        headers: { Origin: ORIGIN, "Sec-Fetch-Site": "same-origin", "Content-Type": "text/plain;charset=UTF-8", "User-Agent": "TestAgent/9.9", "CF-Connecting-IP": "203.0.113.9", ...headers },
        body,
      }),
      env: fullEnv,
      waitUntil: () => undefined,
    });
  return { handler, post, points, env: fullEnv };
}

beforeEach(() => resetRumWindow());

describe("POST /api/rum", () => {
  it("writes one allowlisted point and answers 204 without a body", async () => {
    const { post, points } = setup();
    const res = await post(JSON.stringify(PAYLOAD));
    expect(res.status).toBe(204);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe("");
    expect(points).toEqual([{ blobs: ["1", "full", "cover", "55+", "45-54", "5-8s"], doubles: [0, 0, 1], indexes: ["full"] }]);
  });

  it("never stores the IP address or the user agent", async () => {
    const { post, points } = setup();
    await post(JSON.stringify(PAYLOAD));
    const stored = JSON.stringify(points);
    expect(stored).not.toContain("203.0.113.9");
    expect(stored).not.toContain("TestAgent");
  });

  it("answers 405 to anything but POST (the deploy smoke check relies on it)", async () => {
    const { handler, points, env } = setup();
    const res = await handler({ request: new Request(`${ORIGIN}/api/rum`), env, waitUntil: () => undefined });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
    expect(points).toEqual([]);
  });

  it("drops everything while the kill switch is off", async () => {
    const { post, points } = setup({ RUM_ENABLED: "false" });
    expect((await post(JSON.stringify(PAYLOAD))).status).toBe(204);
    expect(points).toEqual([]);
  });

  it("rejects other origins, oversized bodies and anything outside the protocol", async () => {
    const { post, points } = setup();
    expect((await post(JSON.stringify(PAYLOAD), { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await post("x".repeat(600))).status).toBe(413);
    expect((await post("{not json")).status).toBe(400);
    expect((await post(JSON.stringify({ ...PAYLOAD, ua: "Mozilla" }))).status).toBe(400);
    expect((await post(JSON.stringify({ ...PAYLOAD, tier: "static" }))).status).toBe(400);
    expect(points).toEqual([]);
  });

  it("caps points per isolate and minute", async () => {
    const { post, points } = setup();
    for (let i = 0; i < RUM_ISOLATE_CAP; i++) expect((await post(JSON.stringify(PAYLOAD))).status).toBe(204);
    expect((await post(JSON.stringify(PAYLOAD))).status).toBe(429);
    expect(points).toHaveLength(RUM_ISOLATE_CAP);
  });

  it("is bound in wrangler.toml with an explicit kill switch", () => {
    const toml = readFileSync("wrangler.toml", "utf8");
    expect(toml).toMatch(/^RUM_ENABLED = "(true|false)"$/m);
    expect(toml).toMatch(/\[\[analytics_engine_datasets\]\]\nbinding = "PERF_EVENTS"\ndataset = "perf_events"/);
  });
});
