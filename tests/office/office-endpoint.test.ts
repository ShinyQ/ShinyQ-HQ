import { describe, expect, it } from "vitest";
import { OFFICE_FIXTURES } from "@/lib/office/fixtures";
import { parseOfficeResponse } from "@/lib/office/protocol";
import { createOfficeForwardHandler, createOfficeSnapshotHandler, offSnapshot } from "../../functions/_lib/office";
import type { EdgeCache, OfficeEnv, ServiceBinding } from "../../functions/_lib/types";

const SITE = "https://kurniadi.pages.dev";
const T0 = Date.UTC(2026, 9, 18, 8, 0, 0);

function worker(reply: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const binding: ServiceBinding = {
    async fetch(input, init) {
      const path = new URL(typeof input === "string" ? input : input.url).pathname;
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

async function get(env: OfficeEnv, cache: EdgeCache | null = null, method = "GET") {
  const pending: Promise<unknown>[] = [];
  const handle = createOfficeSnapshotHandler({ cache: () => cache, now: () => T0 });
  const res = await handle({ request: new Request(`${SITE}/api/office?x=1`, { method }), env, waitUntil: (p) => void pending.push(p) });
  await Promise.all(pending);
  return res;
}

describe("GET /api/office", () => {
  it("serves the Worker's snapshot with a 5 s cache and stores it in the edge cache", async () => {
    const { binding, calls } = worker(() => Response.json(OFFICE_FIXTURES.busy));
    const { cache, map } = memoryCache();
    const res = await get({ OFFICE_ENABLED: "true", OFFICE: binding }, cache);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=5");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await res.json()).toEqual(OFFICE_FIXTURES.busy);
    expect([...map.keys()]).toEqual([`${SITE}/api/office`]);
    expect(await (await get({ OFFICE_ENABLED: "true", OFFICE: binding }, cache)).json()).toEqual(OFFICE_FIXTURES.busy);
    expect(calls.map((c) => c.path)).toEqual(["/snapshot"]);
  });

  it("answers disabled when the kill switch is off, without calling the Worker", async () => {
    const { binding, calls } = worker(() => Response.json(OFFICE_FIXTURES.busy));
    expect(await (await get({ OFFICE_ENABLED: "false", OFFICE: binding })).json()).toEqual({ v: 1, enabled: false });
    expect(calls).toEqual([]);
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
