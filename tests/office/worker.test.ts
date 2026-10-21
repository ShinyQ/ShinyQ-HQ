import { describe, expect, it } from "vitest";
import { parseOfficeResponse, parseOfficeResponseV2, parseOfficeResponseV3, parseOfficeResponseV4, type OfficeSnapshotV1, type OfficeSnapshotV2, type OfficeSnapshotV3, type OfficeSnapshotV4 } from "@/lib/office/protocol";
import { hmacHex } from "../../workers/office/src/crypto";
import { Office } from "../../workers/office/src/office";
import { emptyDoc, view, viewV2, viewV3, viewV4, type OfficeDoc, type SessionRecord } from "../../workers/office/src/state";
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

  it("serves v2 with helpers only for ?v=2, and v1 without them for anything else", async () => {
    const { call } = setup();
    expect((await call("/beat", await signedBeat({ helpers: 4 }))).status).toBe(204);
    const v2 = parseOfficeResponseV2(await (await call("/snapshot?v=2")).json()) as OfficeSnapshotV2;
    expect(v2).toMatchObject({ v: 2, desks: [{ slot: 0, helpers: 4 }] });
    for (const query of ["", "?v=1", "?v=5", "?v=4x", "?v=2x", "?v=3x", "?v=", "?x=2", "?v=%32%20"]) {
      const text = await (await call(`/snapshot${query}`)).text();
      expect(text, query).not.toContain('"helpers"');
      expect(parseOfficeResponse(JSON.parse(text)), query).toMatchObject({ v: 1, desks: [{ slot: 0 }] });
    }
    expect((await call("/beat", await signedBeat({ helpers: 0 }))).status).toBe(204);
    expect(await (await call("/snapshot?v=2")).text()).not.toContain('"helpers"');
  });

  it("serves v3 for ?v=3 with ten seats; v1 and v2 keep five desks (slots 0 to 4) and count the rest in extra", async () => {
    const { call } = setup();
    for (let n = 1; n <= 8; n++) {
      const beat = await signedBeat({ session: n.toString(16).padStart(64, "0"), helpers: n === 8 ? 3 : 0, ...(n === 8 ? { state: "input", activity: "asking" } : {}) });
      expect((await call("/beat", beat)).status).toBe(204);
    }
    const v3 = parseOfficeResponseV3(await (await call("/snapshot?v=3")).json()) as OfficeSnapshotV3;
    expect(v3).toMatchObject({ v: 3, extra: 0 });
    expect(v3.desks.map((d) => d.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(v3.desks[7]).toMatchObject({ slot: 7, state: "input", helpers: 3 });
    for (const [query, parse] of [["", parseOfficeResponse], ["?v=2", parseOfficeResponseV2]] as const) {
      const body = await (await call(`/snapshot${query}`)).json();
      const snap = parse(body) as OfficeSnapshotV1 | OfficeSnapshotV2;
      expect(snap, query).not.toBeNull();
      expect(snap.desks.map((d) => d.slot), query).toEqual([0, 1, 2, 3, 4]);
      expect(snap.extra, query).toBe(3);
    }
  });

  it("serves v4 for ?v=4 (the v3 view plus the pipeline); ?v=3, ?v=2 and v1 stay as they were", async () => {
    const { call, map } = setup();
    expect((await call("/beat", await signedBeat({ repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x" }))).status).toBe(204);
    const run = { repository, workflow_run: { id: 42, run_attempt: 1, name: "CI", head_branch: "feat/x", head_repository: { full_name: "ShinyQ/ShinyQ-HQ" }, status: "in_progress", conclusion: null, html_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42" } };
    const job = { repository, workflow_job: { id: 7, run_id: 42, run_attempt: 1, name: "Lint", status: "in_progress", conclusion: null } };
    expect((await call("/github", await signedHook("workflow_run", run, "d-run"))).status).toBe(204);
    expect((await call("/github", await signedHook("workflow_job", job, "d-job"))).status).toBe(204);
    const text = await (await call("/snapshot?v=4")).text();
    const v4 = parseOfficeResponseV4(JSON.parse(text)) as OfficeSnapshotV4;
    expect(v4).toMatchObject({ v: 4, pipeline: { runs: [{ id: 42, jobs: [{ name: "Lint", status: "running" }] }] } });
    const doc = map.get("doc") as OfficeDoc;
    expect(text).toBe(JSON.stringify(viewV4(doc, T0)));
    for (const [query, body] of [["?v=3", viewV3(doc, T0)], ["?v=2", viewV2(doc, T0)], ["", view(doc, T0)], ["?v=5", view(doc, T0)], ["?v=4x", view(doc, T0)]] as const) {
      const served = await (await call(`/snapshot${query}`)).text();
      expect(served, query).toBe(JSON.stringify(body));
      expect(served, query).not.toContain('"pipeline"');
    }
  });

  it("forwards only ?v=2, ?v=3 and ?v=4 to the Durable Object", async () => {
    const seen: string[] = [];
    const env: OfficeWorkerEnv = {
      OFFICE_DO: { idFromName: () => "office", get: () => ({ fetch: async (input: string) => (seen.push(input), Response.json({})) }) },
    };
    const worker = createOfficeWorker({ blocklist: [], now: () => T0 });
    for (const query of ["", "?v=2", "?v=3", "?v=4", "?v=5", "?v=4x", "?v=3x", "?v=2&x=<script>", "?v=3&x=<script>", "?v=4&x=<script>", "?junk=1"]) await worker.fetch(new Request(`https://hq-office/snapshot${query}`), env);
    expect(seen).toEqual([
      "https://office/snapshot",
      "https://office/snapshot?v=2",
      "https://office/snapshot?v=3",
      "https://office/snapshot?v=4",
      "https://office/snapshot",
      "https://office/snapshot",
      "https://office/snapshot",
      "https://office/snapshot?v=2",
      "https://office/snapshot?v=3",
      "https://office/snapshot?v=4",
      "https://office/snapshot",
    ]);
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

  it("moves back-row seats stored in `slot` to `seat` on load and writes the document once", async () => {
    const { map, ctx } = memoryStorage();
    const doc = emptyDoc(T0);
    const rec = (n: number, slot: number): SessionRecord => ({ id: n.toString(16).padStart(64, "0"), agent: "codex", slot, firstSeen: T0 + n, lastBeat: T0, state: "working", activity: "editing", since: T0, recent: [] });
    map.set("doc", { ...doc, sessions: [0, 1, 2, 3, 4, 5, 6].map((n) => rec(n, n)) });
    let puts = 0;
    const office = new Office({ storage: { get: ctx.storage.get, put: async (k, v) => (puts++, ctx.storage.put(k, v)) } }, {} as OfficeWorkerEnv, () => T0 + 1000);
    const v3 = (await (await office.fetch(new Request("https://office/snapshot?v=3"))).json()) as OfficeSnapshotV3;
    expect(v3.desks.map((d) => d.slot)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const stored = map.get("doc") as OfficeDoc;
    expect(stored.sessions.map((s) => [s.slot, s.seat])).toEqual([[0, undefined], [1, undefined], [2, undefined], [3, undefined], [4, undefined], [null, 5], [null, 6]]);
    await office.fetch(new Request("https://office/snapshot"));
    expect(puts).toBe(1);
  });
});
