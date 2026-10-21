import { describe, expect, it } from "vitest";
import { OFFICE_FIXTURES, OFFICE_FIXTURES_V2, OFFICE_FIXTURES_V3, OFFICE_FIXTURES_V4 } from "@/lib/office/fixtures";
import { parseOfficeResponse, parseOfficeResponseV2, parseOfficeResponseV3 } from "@/lib/office/protocol";
import { parseOfficeResponseV4 } from "@/lib/office/protocolV4";
import { createOfficeForwardHandler, createOfficeSnapshotHandler, offSnapshot } from "../../functions/_lib/office";
import type { EdgeCache, OfficeEnv, ServiceBinding } from "../../functions/_lib/types";

const SITE = "https://kurniadi.pages.dev";
const T0 = Date.UTC(2026, 9, 18, 8, 0, 0);

function worker(reply: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const binding: ServiceBinding = {
    async fetch(input, init) {
      const url = new URL(typeof input === "string" ? input : input.url);
      const path = url.pathname + url.search;
      calls.push({ path, init });
      return reply(path, init);
    },
  };
  return { binding, calls };
}

function memoryCache() {
  const map = new Map<string, Response>();
  const cache: EdgeCache = {
    async match(request) {
      return map.get(request.url)?.clone();
    },
    async put(request, response) {
      map.set(request.url, response);
    },
  };
  return { map, cache };
}

async function get(env: OfficeEnv, cache: EdgeCache | null = null, method = "GET", headers: Record<string, string> = {}, query = "?x=1") {
  const pending: Promise<unknown>[] = [];
  const handle = createOfficeSnapshotHandler({ cache: () => cache, now: () => T0 });
  const res = await handle({ request: new Request(`${SITE}/api/office${query}`, { method, headers }), env, waitUntil: (p) => void pending.push(p) });
  await Promise.all(pending);
  return res;
}

describe("GET /api/office", () => {
  it("serves the Worker's snapshot with a 5 s cache and stores it in the edge cache", async () => {
    const { binding, calls } = worker(() => Response.json(OFFICE_FIXTURES.busy));
    const { cache, map } = memoryCache();
    const res = await get({ OFFICE_ENABLED: "true", OFFICE: binding }, cache);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=5, stale-while-revalidate=30");
    expect(res.headers.get("ETag")).toMatch(/^"[0-9a-f]{32}"$/);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await res.json()).toEqual(OFFICE_FIXTURES.busy);
    expect([...map.keys()]).toEqual([`${SITE}/api/office`]);
    expect(await (await get({ OFFICE_ENABLED: "true", OFFICE: binding }, cache)).json()).toEqual(OFFICE_FIXTURES.busy);
    expect(calls.map((c) => c.path)).toEqual(["/snapshot"]);
  });

  it("answers disabled when the kill switch is off, without calling the Worker", async () => {
    const { binding, calls } = worker(() => Response.json(OFFICE_FIXTURES.busy));
    const res = await get({ OFFICE_ENABLED: "false", OFFICE: binding });
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(res.headers.get("ETag")).toMatch(/^"[0-9a-f]{32}"$/);
    expect(await res.json()).toEqual({ v: 1, enabled: false });
    expect(calls).toEqual([]);
  });

  it("answers 304 with no body when If-None-Match equals the ETag", async () => {
    const { binding } = worker(() => Response.json(OFFICE_FIXTURES.busy));
    const env: OfficeEnv = { OFFICE_ENABLED: "true", OFFICE: binding };
    const first = await get(env);
    const etag = first.headers.get("ETag") ?? "";
    const again = await get(env, null, "GET", { "If-None-Match": etag });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect(again.headers.get("ETag")).toBe(etag);
    expect(again.headers.get("Cache-Control")).toBe(first.headers.get("Cache-Control"));
    expect(again.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const disabled = await get({ OFFICE_ENABLED: "false" });
    expect((await get({ OFFICE_ENABLED: "false" }, null, "GET", { "If-None-Match": disabled.headers.get("ETag") ?? "" })).status).toBe(304);
    expect((await get(env, null, "GET", { "If-None-Match": '"0123"' })).status).toBe(200);
  });

  it("answers 304 from a cache hit without calling the Worker", async () => {
    const { binding, calls } = worker(() => Response.json(OFFICE_FIXTURES.busy));
    const { cache } = memoryCache();
    const env: OfficeEnv = { OFFICE_ENABLED: "true", OFFICE: binding };
    const etag = (await get(env, cache)).headers.get("ETag") ?? "";
    const hit = await get(env, cache, "GET", { "If-None-Match": etag });
    expect(hit.status).toBe(304);
    expect(await hit.text()).toBe("");
    expect(hit.headers.get("ETag")).toBe(etag);
    expect(calls.map((c) => c.path)).toEqual(["/snapshot"]);
  });

  it("stores a HEAD on a cache miss so the next GET comes from the cache", async () => {
    const { binding, calls } = worker(() => Response.json(OFFICE_FIXTURES.busy));
    const { cache } = memoryCache();
    const env: OfficeEnv = { OFFICE_ENABLED: "true", OFFICE: binding };
    const head = await get(env, cache, "HEAD");
    expect(await head.text()).toBe("");
    expect(head.headers.get("ETag")).toMatch(/^"[0-9a-f]{32}"$/);
    const next = await get(env, cache);
    expect(await next.json()).toEqual(OFFICE_FIXTURES.busy);
    expect(next.headers.get("ETag")).toBe(head.headers.get("ETag"));
    expect(calls.map((c) => c.path)).toEqual(["/snapshot"]);
  });

  it("answers mode off when unbound, failing, throwing or invalid", async () => {
    const off = offSnapshot(T0);
    expect(parseOfficeResponse(off)).toEqual(off);
    const cases: OfficeEnv[] = [
      { OFFICE_ENABLED: "true" },
      { OFFICE_ENABLED: "true", OFFICE: worker(() => new Response(null, { status: 500 })).binding },
      { OFFICE_ENABLED: "true", OFFICE: worker(() => Promise.reject(new Error("down"))).binding },
      { OFFICE_ENABLED: "true", OFFICE: worker(() => Response.json({ v: 1, enabled: true, mode: "live", desks: "nope" })).binding },
    ];
    for (const env of cases) expect(await (await get(env)).json()).toEqual(off);
  });

  it("serves v2 only for ?v=2, from the Worker's v2 snapshot, under its own cache key", async () => {
    const { binding, calls } = worker((path) => Response.json(path === "/snapshot?v=2" ? OFFICE_FIXTURES_V2.busy : OFFICE_FIXTURES.busy));
    const { cache, map } = memoryCache();
    const env: OfficeEnv = { OFFICE_ENABLED: "true", OFFICE: binding };
    const v2 = await get(env, cache, "GET", {}, "?v=2");
    expect(await v2.json()).toEqual(OFFICE_FIXTURES_V2.busy);
    const v1 = await get(env, cache, "GET", {}, "");
    expect(await v1.json()).toEqual(OFFICE_FIXTURES.busy);
    expect(v1.headers.get("ETag")).not.toBe(v2.headers.get("ETag"));
    expect([...map.keys()].sort()).toEqual([`${SITE}/api/office`, `${SITE}/api/office?v=2`]);
    expect(await (await get(env, cache, "GET", {}, "?v=2")).json()).toEqual(OFFICE_FIXTURES_V2.busy);
    expect(calls.map((c) => c.path)).toEqual(["/snapshot?v=2", "/snapshot"]);
  });

  it("serves v3 only for ?v=3, from the Worker's v3 snapshot, with one cache entry per version", async () => {
    const bodies: Record<string, unknown> = { "/snapshot": OFFICE_FIXTURES.busy, "/snapshot?v=2": OFFICE_FIXTURES_V2.busy, "/snapshot?v=3": OFFICE_FIXTURES_V3.busy };
    const { binding, calls } = worker((path) => Response.json(bodies[path]));
    const { cache, map } = memoryCache();
    const env: OfficeEnv = { OFFICE_ENABLED: "true", OFFICE: binding };
    const v3 = await get(env, cache, "GET", {}, "?v=3");
    expect(await v3.json()).toEqual(OFFICE_FIXTURES_V3.busy);
    const v2 = await get(env, cache, "GET", {}, "?v=2");
    const v1 = await get(env, cache, "GET", {}, "");
    expect(new Set([v1, v2, v3].map((r) => r.headers.get("ETag"))).size).toBe(3);
    for (let i = 0; i < 2; i++) for (const query of ["?v=3", "?v=2", "", "?v=5", "?v=3x"]) await get(env, cache, "GET", {}, query);
    expect([...map.keys()].sort()).toEqual([`${SITE}/api/office`, `${SITE}/api/office?v=2`, `${SITE}/api/office?v=3`]);
    expect(calls.map((c) => c.path)).toEqual(["/snapshot?v=3", "/snapshot?v=2", "/snapshot"]);
    expect(await (await get(env, cache, "GET", {}, "?v=3")).json()).toEqual(OFFICE_FIXTURES_V3.busy);
  });

  it("serves v4 only for ?v=4, from the Worker's v4 snapshot, with one cache entry per version; v1 to v3 unchanged", async () => {
    const bodies: Record<string, unknown> = { "/snapshot": OFFICE_FIXTURES.busy, "/snapshot?v=2": OFFICE_FIXTURES_V2.busy, "/snapshot?v=3": OFFICE_FIXTURES_V3.busy, "/snapshot?v=4": OFFICE_FIXTURES_V4.busy };
    const { binding, calls } = worker((path) => Response.json(bodies[path]));
    const { cache, map } = memoryCache();
    const env: OfficeEnv = { OFFICE_ENABLED: "true", OFFICE: binding };
    expect(await (await get(env, cache, "GET", {}, "?v=4")).json()).toEqual(OFFICE_FIXTURES_V4.busy);
    for (const [query, body] of [["?v=3", OFFICE_FIXTURES_V3.busy], ["?v=2", OFFICE_FIXTURES_V2.busy], ["", OFFICE_FIXTURES.busy], ["?v=5", OFFICE_FIXTURES.busy], ["?v=4x", OFFICE_FIXTURES.busy], ["?v=4&x=%3Cscript%3E", OFFICE_FIXTURES_V4.busy]] as const) expect(await (await get(env, cache, "GET", {}, query)).json(), query).toEqual(body);
    expect([...map.keys()].sort()).toEqual([`${SITE}/api/office`, `${SITE}/api/office?v=2`, `${SITE}/api/office?v=3`, `${SITE}/api/office?v=4`]);
    expect(calls.map((c) => c.path)).toEqual(["/snapshot?v=4", "/snapshot?v=3", "/snapshot?v=2", "/snapshot"]);
  });

  it("serves a v3, v2 or v1 body as v4 with an empty pipeline after a rollback, and mode off as v4 on failure", async () => {
    for (const body of [OFFICE_FIXTURES_V3.busy, OFFICE_FIXTURES_V2.busy, OFFICE_FIXTURES.busy]) {
      const rolledBack = worker(() => Response.json(body)).binding;
      expect(await (await get({ OFFICE_ENABLED: "true", OFFICE: rolledBack }, null, "GET", {}, "?v=4")).json()).toEqual({ ...body, v: 4, pipeline: { runs: [], ships: [] } });
    }
    const off4 = { ...offSnapshot(T0), v: 4, pipeline: { runs: [], ships: [] } };
    expect(parseOfficeResponseV4(off4)).toEqual(off4);
    expect(await (await get({ OFFICE_ENABLED: "true" }, null, "GET", {}, "?v=4")).json()).toEqual(off4);
    expect(await (await get({ OFFICE_ENABLED: "true", OFFICE: worker(() => new Response(null, { status: 500 })).binding }, null, "GET", {}, "?v=4")).json()).toEqual(off4);
    expect(await (await get({ OFFICE_ENABLED: "false" }, null, "GET", {}, "?v=4")).json()).toEqual({ v: 1, enabled: false });
  });

  it("never serves a slot above 4 or more than five desks on v1 or v2, even if a Worker answered ten", async () => {
    const tenEverywhere = worker(() => Response.json(OFFICE_FIXTURES_V3.busy)).binding;
    const env: OfficeEnv = { OFFICE_ENABLED: "true", OFFICE: tenEverywhere };
    for (const [query, off] of [["", offSnapshot(T0)], ["?v=2", { ...offSnapshot(T0), v: 2 }]] as const) {
      const body = await (await get(env, null, "GET", {}, query)).json();
      expect(body, query).toEqual(off);
    }
    const ten = await (await get(env, null, "GET", {}, "?v=3")).json();
    expect(ten.desks.map((d: { slot: number }) => d.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("serves a v2 or v1 body as v3 when the Worker was rolled back, and mode off as v3 on failure", async () => {
    // A Worker from before v3 forwards only ?v=2 (its Durable Object answers v1 to ?v=3); one that answered v2 is read too.
    for (const body of [OFFICE_FIXTURES.busy, OFFICE_FIXTURES_V2.busy]) {
      const rolledBack = worker(() => Response.json(body)).binding;
      expect(await (await get({ OFFICE_ENABLED: "true", OFFICE: rolledBack }, null, "GET", {}, "?v=3")).json()).toEqual({ ...body, v: 3 });
    }
    // A rolled-back Worker's v1 or v2 body with up to ten desks (slots 0 to 9) still reads as v3, not off.
    const tenV3 = OFFICE_FIXTURES_V3.busy;
    if (!tenV3.enabled) throw new Error("busy is enabled");
    const tenV1 = { ...tenV3, v: 1, desks: tenV3.desks.map((d) => {
      const copy = { ...d };
      delete copy.helpers;
      return copy;
    }) };
    for (const body of [tenV1, { ...tenV3, v: 2 }]) {
      const rolledBack = worker(() => Response.json(body)).binding;
      expect(await (await get({ OFFICE_ENABLED: "true", OFFICE: rolledBack }, null, "GET", {}, "?v=3")).json()).toEqual({ ...body, v: 3 });
    }
    const off3 = { ...offSnapshot(T0), v: 3 };
    expect(parseOfficeResponseV3(off3)).toEqual(off3);
    expect(await (await get({ OFFICE_ENABLED: "true" }, null, "GET", {}, "?v=3")).json()).toEqual(off3);
    expect(await (await get({ OFFICE_ENABLED: "true", OFFICE: worker(() => new Response(null, { status: 500 })).binding }, null, "GET", {}, "?v=3")).json()).toEqual(off3);
    expect(await (await get({ OFFICE_ENABLED: "true", OFFICE: worker(() => Response.json({ ...OFFICE_FIXTURES_V3.busy, v: 4 })).binding }, null, "GET", {}, "?v=3")).json()).toEqual(off3);
    expect(await (await get({ OFFICE_ENABLED: "false" }, null, "GET", {}, "?v=3")).json()).toEqual({ v: 1, enabled: false });
  });

  it("serves v1 without helpers for no query, ?v=5 and junk, even if a Worker answered helpers", async () => {
    const { binding, calls } = worker((path) => Response.json(path === "/snapshot?v=2" ? OFFICE_FIXTURES_V2.busy : OFFICE_FIXTURES.busy));
    const env: OfficeEnv = { OFFICE_ENABLED: "true", OFFICE: binding };
    for (const query of ["", "?v=1", "?v=5", "?v=3x", "?v=2x", "?v=%3Cscript%3E", "?x=2"]) {
      const text = await (await get(env, null, "GET", {}, query)).text();
      expect(text, query).not.toContain('"helpers"');
      expect(JSON.parse(text), query).toEqual(OFFICE_FIXTURES.busy);
    }
    expect(new Set(calls.map((c) => c.path))).toEqual(new Set(["/snapshot"]));
    // A v1 answer that somehow carried helpers fails v1 validation: the Function answers mode off, still without them.
    const leaky = worker(() => Response.json(OFFICE_FIXTURES_V2.busy)).binding;
    const text = await (await get({ OFFICE_ENABLED: "true", OFFICE: leaky }, null, "GET", {}, "")).text();
    expect(text).not.toContain('"helpers"');
    expect(JSON.parse(text)).toEqual(offSnapshot(T0));
  });

  it("serves a v1 body as v2 when the Worker was rolled back, and mode off as v2 on failure", async () => {
    const rolledBack = worker(() => Response.json(OFFICE_FIXTURES.busy)).binding;
    expect(await (await get({ OFFICE_ENABLED: "true", OFFICE: rolledBack }, null, "GET", {}, "?v=2")).json()).toEqual({ ...OFFICE_FIXTURES.busy, v: 2 });
    const off2 = { ...offSnapshot(T0), v: 2 };
    expect(parseOfficeResponseV2(off2)).toEqual(off2);
    expect(await (await get({ OFFICE_ENABLED: "true" }, null, "GET", {}, "?v=2")).json()).toEqual(off2);
    expect(await (await get({ OFFICE_ENABLED: "true", OFFICE: worker(() => new Response(null, { status: 500 })).binding }, null, "GET", {}, "?v=2")).json()).toEqual(off2);
    expect(await (await get({ OFFICE_ENABLED: "false" }, null, "GET", {}, "?v=2")).json()).toEqual({ v: 1, enabled: false });
  });

  it("answers HEAD without a body and other methods with 405", async () => {
    const { binding } = worker(() => Response.json(OFFICE_FIXTURES.busy));
    const head = await get({ OFFICE_ENABLED: "true", OFFICE: binding }, null, "HEAD");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await get({ OFFICE_ENABLED: "true", OFFICE: binding }, null, "POST")).status).toBe(405);
  });
});

describe("POST /api/office/beat and /api/office/github", () => {
  const post = (route: "beat" | "github", env: OfficeEnv, body: string, headers: Record<string, string> = {}) =>
    createOfficeForwardHandler(route)({ request: new Request(`${SITE}/api/office/${route}`, { method: "POST", body, headers }), env, waitUntil: () => undefined });

  it("forwards the raw body and only the signature headers, and passes the Worker's status through", async () => {
    const { binding, calls } = worker(() => new Response(null, { status: 401 }));
    const res = await post("beat", { OFFICE_ENABLED: "true", OFFICE: binding }, '{"v":1}', { "X-Office-Signature": "sha256=ab", Cookie: "a=b" });
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(calls[0].path).toBe("/beat");
    expect(calls[0].init?.body).toBe('{"v":1}');
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("X-Office-Signature")).toBe("sha256=ab");
    expect(headers.get("Cookie")).toBeNull();
    await post("github", { OFFICE_ENABLED: "true", OFFICE: binding }, "{}", { "X-Hub-Signature-256": "sha256=cd", "X-GitHub-Event": "ping", "X-GitHub-Delivery": "id-1" });
    expect(new Headers(calls[1].init?.headers).get("X-GitHub-Event")).toBe("ping");
  });

  it("drops everything when off, answers 503 unbound, 413 too big, 405 for GET", async () => {
    const { binding, calls } = worker(() => new Response(null, { status: 204 }));
    expect((await post("beat", { OFFICE_ENABLED: "false", OFFICE: binding }, "{}")).status).toBe(204);
    expect(calls).toEqual([]);
    expect((await post("beat", { OFFICE_ENABLED: "true" }, "{}")).status).toBe(503);
    expect((await post("beat", { OFFICE_ENABLED: "true", OFFICE: binding }, "x".repeat(4096))).status).toBe(413);
    const getBeat = await createOfficeForwardHandler("beat")({ request: new Request(`${SITE}/api/office/beat`), env: { OFFICE_ENABLED: "true", OFFICE: binding }, waitUntil: () => undefined });
    expect(getBeat.status).toBe(405);
  });
});
