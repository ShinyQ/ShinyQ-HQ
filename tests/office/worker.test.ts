import { describe, expect, it } from "vitest";
import { parseOfficeResponse, type OfficeSnapshotV1 } from "@/lib/office/protocol";
import { hmacHex } from "../../workers/office/src/crypto";
import { Office } from "../../workers/office/src/office";
import type { DurableObjectStateLike, OfficeWorkerEnv } from "../../workers/office/src/types";
import { createOfficeWorker } from "../../workers/office/src/worker";

const T0 = Date.UTC(2026, 9, 18, 8, 0, 0);
const KEY = "ingest-key";
const HOOK = "webhook-secret";

function memoryStorage() {
  const map = new Map<string, unknown>();
  const storage: DurableObjectStateLike["storage"] = {
    async get<T>(key: string) {
      return map.get(key) as T | undefined;
    },
    async put<T>(key: string, value: T) {
      map.set(key, structuredClone(value));
    },
  };
  return { map, ctx: { storage } };
}

function setup(now = () => T0) {
  const { map, ctx } = memoryStorage();
  const office = new Office(ctx, {} as OfficeWorkerEnv, now);
  const env: OfficeWorkerEnv = {
    OFFICE_DO: { idFromName: () => "office", get: () => ({ fetch: (input: string, init?: RequestInit) => office.fetch(new Request(input, init)) }) },
    OFFICE_INGEST_KEY: KEY,
    GITHUB_WEBHOOK_SECRET: HOOK,
    OFFICE_REPO_ALLOWLIST: "ShinyQ/*",
  };
  const worker = createOfficeWorker({ blocklist: ["acme bank"], now });
  const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://hq-office${path}`, init), env);
  return { map, env, call };
}

async function signedBeat(extra: Record<string, unknown> = {}, key = KEY) {
  const body = JSON.stringify({ v: 1, agent: "copilot", session: "c".repeat(64), state: "working", activity: "editing", ts: T0, ...extra });
  return { method: "POST", body, headers: { "X-Office-Signature": `sha256=${await hmacHex(key, body)}` } };
}

async function signedHook(event: string, payload: unknown, delivery = "d-1") {
  const body = JSON.stringify(payload);
  return { method: "POST", body, headers: { "X-Hub-Signature-256": `sha256=${await hmacHex(HOOK, body)}`, "X-GitHub-Event": event, "X-GitHub-Delivery": delivery } };
}

const snapshot = async (call: ReturnType<typeof setup>["call"]) => parseOfficeResponse(await (await call("/snapshot")).json()) as OfficeSnapshotV1;
const repository = { full_name: "ShinyQ/ShinyQ-HQ", private: false, default_branch: "main" };

describe("hq-office Worker", () => {
  it("starts empty and semi-live", async () => {
    const { call } = setup();
    expect(await snapshot(call)).toMatchObject({ mode: "semi-live", desks: [], extra: 0 });
  });

  it("accepts a signed beat and stores one document", async () => {
    const { call, map } = setup();
    expect((await call("/beat", await signedBeat())).status).toBe(204);
    expect([...map.keys()]).toEqual(["doc"]);
    expect((await snapshot(call)).desks).toMatchObject([{ slot: 0, agent: "copilot", state: "working" }]);
  });

  it("rejects bad signatures, stale or future timestamps, bad bodies and big bodies", async () => {
    const { call } = setup();
    expect((await call("/beat", await signedBeat({}, "wrong"))).status).toBe(401);
    expect((await call("/beat", await signedBeat({ ts: T0 - 61_000 }))).status).toBe(401);
    expect((await call("/beat", await signedBeat({ ts: T0 + 61_000 }))).status).toBe(401);
    expect((await call("/beat", await signedBeat({ prompt: "secret" }))).status).toBe(400);
    expect((await call("/beat", await signedBeat({ title: "x".repeat(3000) }))).status).toBe(413);
    expect((await call("/beat", { method: "GET" })).status).toBe(405);
    expect((await snapshot(call)).desks).toEqual([]);
  });

  it("answers 503 without secrets and 404 elsewhere", async () => {
    const { call, env } = setup();
    delete env.OFFICE_INGEST_KEY;
    delete env.GITHUB_WEBHOOK_SECRET;
    expect((await call("/beat", await signedBeat())).status).toBe(503);
    expect((await call("/github", await signedHook("ping", { repository }))).status).toBe(503);
    expect((await call("/nope")).status).toBe(404);
  });

  it("verifies webhooks, learns public repositories and then keeps beat titles", async () => {
    const { call } = setup();
    const titled = { repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x", title: "X" };
    await call("/beat", await signedBeat(titled));
    expect((await snapshot(call)).desks[0]).not.toHaveProperty("title");
    const bad = await signedHook("ping", { repository });
    expect((await call("/github", { ...bad, headers: { ...bad.headers, "X-Hub-Signature-256": "sha256=00" } })).status).toBe(401);
    expect((await call("/github", await signedHook("ping", { repository }))).status).toBe(204);
    await call("/beat", await signedBeat(titled));
    expect((await snapshot(call)).desks[0]).toMatchObject({ repo: "ShinyQ/ShinyQ-HQ", title: "X" });
  });

  it("drops private repositories and redacts blocked titles", async () => {
    const { call } = setup();
    expect((await call("/github", await signedHook("ping", { repository: { ...repository, private: true } }))).status).toBe(204);
    const pr = {
      action: "opened",
      repository,
      sender: { login: "ShinyQ" },
      pull_request: { number: 3, merged: false, title: "Acme Bank login", html_url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/3", head: { ref: "fix/z", repo: { full_name: "ShinyQ/ShinyQ-HQ" } } },
    };
    await call("/github", await signedHook("pull_request", pr, "d-2"));
    expect((await snapshot(call)).github).toMatchObject([{ kind: "pr", title: "#3 Pull request #3" }]);
    const fork = { ...pr, pull_request: { ...pr.pull_request, number: 4, html_url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/4", head: { ref: "fix/z", repo: { full_name: "stranger/ShinyQ-HQ" } } } };
    expect((await call("/github", await signedHook("pull_request", fork, "d-3"))).status).toBe(204);
    expect((await snapshot(call)).github).toHaveLength(1);
  });

  it("keeps the document across a new Durable Object instance (cold start)", async () => {
    const { map, ctx } = memoryStorage();
    const first = new Office(ctx, {} as OfficeWorkerEnv, () => T0);
    const body = JSON.stringify({ v: 1, agent: "codex", session: "d".repeat(64), state: "testing", activity: "testing", ts: T0 });
    expect((await first.fetch(new Request("https://office/beat", { method: "POST", body }))).status).toBe(204);
    const second = new Office({ storage: ctx.storage }, {} as OfficeWorkerEnv, () => T0 + 1000);
    const snap = (await (await second.fetch(new Request("https://office/snapshot"))).json()) as OfficeSnapshotV1;
    expect(snap.desks).toMatchObject([{ agent: "codex", state: "testing" }]);
    expect(map.size).toBe(1);
  });
});
