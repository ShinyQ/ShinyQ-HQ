import { beforeEach, describe, expect, it } from "vitest";
import { createVisitHandler, resetVisitWindow, VISIT_IP_CAP, VISIT_ISOLATE_CAP } from "../../functions/_lib/visit";
import type { AnalyticsEngineDataset, VisitEnv } from "../../functions/_lib/types";
import { VISIT_MAX_BYTES } from "../../src/lib/stats/visit";

const ORIGIN = "https://kurniadi.pages.dev";

function setup(env: Partial<VisitEnv> = {}, clock = { t: Date.UTC(2026, 9, 14, 3, 0, 0) }) {
  const points: Parameters<AnalyticsEngineDataset["writeDataPoint"]>[0][] = [];
  const fullEnv: VisitEnv = { STATS_ENABLED: "true", ASK_ALLOWED_ORIGINS: `${ORIGIN},https://kurniadi.dev`, VISIT_EVENTS: { writeDataPoint: (p) => points.push(p) }, ...env };
  const handler = createVisitHandler({ now: () => clock.t });
  const post = (body: string, headers: Record<string, string> = {}) =>
    handler({
      request: new Request(`${ORIGIN}/api/visit`, {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "text/plain;charset=UTF-8", "User-Agent": "TestAgent/9.9", "CF-Connecting-IP": "203.0.113.9", ...headers },
        body,
      }),
      env: fullEnv,
      waitUntil: () => undefined,
    });
  return { handler, post, points, env: fullEnv };
}


/** A body without Content-Length that streams `total` bytes in 64-byte chunks; `pulled()` counts what was read. */
function endlessBody(total: number) {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) return controller.close();
      sent += 64;
      controller.enqueue(new Uint8Array(64).fill(0x20));
    },
  });
  return { stream, pulled: () => sent };
}

beforeEach(() => resetVisitWindow());

describe("POST /api/visit", () => {
  it("writes one allowlisted point and answers 204 without a body", async () => {
    const { post, points } = setup();
    const res = await post('{"v":1,"mode":"classic"}');
    expect(res.status).toBe(204);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe("");
    expect(points).toEqual([{ blobs: ["1", "classic"], doubles: [1], indexes: ["visit"] }]);
  });

  it("never stores the IP address or the user agent", async () => {
    const { post, points } = setup();
    await post('{"v":1,"mode":"3d"}');
    const stored = JSON.stringify(points);
    expect(stored).not.toContain("203.0.113.9");
    expect(stored).not.toContain("TestAgent");
  });

  it("answers 405 to anything but POST (the deploy smoke check relies on it)", async () => {
    const { handler, points, env } = setup();
    const res = await handler({ request: new Request(`${ORIGIN}/api/visit`), env, waitUntil: () => undefined });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
    expect(points).toEqual([]);
  });

  it("drops every point when the kill switch is off", async () => {
    for (const STATS_ENABLED of ["false", undefined, "TRUE"]) {
      const { post, points } = setup({ STATS_ENABLED });
      expect((await post('{"v":1,"mode":"3d"}')).status).toBe(204);
      expect(points).toEqual([]);
    }
  });

  it("rejects other origins", async () => {
    const { post, points } = setup();
    expect((await post('{"v":1,"mode":"3d"}', { Origin: "https://evil.example" })).status).toBe(403);
    expect(points).toEqual([]);
  });

  it("rejects bodies over the cap, broken JSON and anything but the exact payload", async () => {
    const { post, points } = setup();
    expect((await post(`{"v":1,"mode":"3d","x":"${"a".repeat(200)}"}`)).status).toBe(413);
    expect((await post("{", {})).status).toBe(400);
    expect((await post('{"v":1,"mode":"vr"}')).status).toBe(400);
    expect((await post('{"v":1,"mode":"3d","floor":"L1"}')).status).toBe(400);
    expect(points).toEqual([]);
  });

  it("stops reading a body without Content-Length at the cap (S7)", async () => {
    const { env, handler, points } = setup();
    const body = endlessBody(1_000_000);
    const request = new Request(`${ORIGIN}/api/visit`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "text/plain;charset=UTF-8" }, body: body.stream, duplex: "half" } as RequestInit);
    expect(request.headers.get("Content-Length")).toBeNull();
    expect((await handler({ request, env, waitUntil: () => undefined })).status).toBe(413);
    expect(body.pulled()).toBeLessThan(VISIT_MAX_BYTES + 256);
    expect(points).toEqual([]);
  });

  it("caps points per isolate and minute", async () => {
    const { post, points } = setup();
    const ip = (i: number) => ({ "CF-Connecting-IP": `198.51.100.${i % 250}` });
    for (let i = 0; i < VISIT_ISOLATE_CAP; i++) await post('{"v":1,"mode":"3d"}', ip(i));
    expect((await post('{"v":1,"mode":"3d"}', ip(7))).status).toBe(429);
    expect(points).toHaveLength(VISIT_ISOLATE_CAP);
  });

  it("writes the visit ping as its own kind (the public visit count)", async () => {
    const { post, points } = setup();
    expect((await post('{"v":1,"kind":"visit"}')).status).toBe(204);
    expect(points).toEqual([{ blobs: ["1", "visit"], doubles: [1], indexes: ["visit"] }]);
    expect((await post('{"v":1,"kind":"view"}')).status).toBe(400);
    expect((await post('{"v":1,"kind":"visit","mode":"3d"}')).status).toBe(400);
    expect(points).toHaveLength(1);
  });

  it("caps visit pings per visitor and hour silently, without storing the IP", async () => {
    const clock = { t: Date.UTC(2026, 9, 14, 3, 0, 0) };
    const { post, points } = setup({ ASK_IP_SALT_SEED: "seed" }, clock);
    for (let i = 0; i < VISIT_IP_CAP.visit + 5; i++) expect((await post('{"v":1,"kind":"visit"}')).status).toBe(204);
    expect(points).toHaveLength(VISIT_IP_CAP.visit);
    await post('{"v":1,"kind":"visit"}', { "CF-Connecting-IP": "203.0.113.10" });
    expect(points).toHaveLength(VISIT_IP_CAP.visit + 1);
    // Mode pings have their own budget.
    await post('{"v":1,"mode":"3d"}');
    expect(points).toHaveLength(VISIT_IP_CAP.visit + 2);
    clock.t += 3_600_000;
    await post('{"v":1,"kind":"visit"}');
    expect(points).toHaveLength(VISIT_IP_CAP.visit + 3);
    expect(JSON.stringify(points)).not.toContain("203.0.113");
  });

  it("never fails when Analytics Engine throws or is unbound", async () => {
    const throwing = setup({ VISIT_EVENTS: { writeDataPoint: () => { throw new Error("down"); } } });
    expect((await throwing.post('{"v":1,"mode":"both"}')).status).toBe(204);
    const unbound = setup({ VISIT_EVENTS: undefined });
    expect((await unbound.post('{"v":1,"mode":"both"}')).status).toBe(204);
  });
});
