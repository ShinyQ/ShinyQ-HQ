import { describe, expect, it } from "vitest";
import { OFFICE_STATES, parseOfficeResponse, parseOfficeResponseV2, parseOfficeResponseV3, type OfficeSnapshotV1, type OfficeSnapshotV2, type OfficeSnapshotV3, type OfficeSnapshotV4 } from "@/lib/office/protocol";
import { parseOfficeResponseV4 } from "@/lib/office/protocolV4";
import { hmacHex } from "../../workers/office/src/crypto";
import { Office } from "../../workers/office/src/office";
import { dayStart, historyWindow, parseOfficeHistory, parseOfficeHistoryIndex, type OfficeHistoryV1 } from "@/lib/office/protocolHistory";
import { emptyLog, historyDay, historyIndex, logKey, type DayLog } from "../../workers/office/src/history";
import { emptyDoc, view, viewV2, viewV3, viewV4, type GithubUpdate, type OfficeDoc, type SessionRecord } from "../../workers/office/src/state";
import type { DurableObjectStateLike, OfficeWorkerEnv } from "../../workers/office/src/types";
import { createOfficeWorker } from "../../workers/office/src/worker";

const T0 = Date.UTC(2026, 9, 18, 8, 0, 0);
const KEY = "ingest-key";
const HOOK = "webhook-secret";

/** The SQLite-backed storage API as a Map: `writes` keeps the row keys of every put call, `list` is sorted with an exclusive `end`. */
function memoryStorage() {
  const map = new Map<string, unknown>();
  const writes: string[][] = [];
  const get = (async (key: string | string[]) => {
    if (typeof key === "string") return structuredClone(map.get(key));
    return new Map(key.filter((k) => map.has(k)).map((k) => [k, structuredClone(map.get(k))]));
  }) as DurableObjectStateLike["storage"]["get"];
  const put = (async (key: string | Record<string, unknown>, value?: unknown) => {
    const rows = typeof key === "string" ? { [key]: value } : key;
    writes.push(Object.keys(rows).sort());
    for (const [k, v] of Object.entries(rows)) map.set(k, structuredClone(v));
  }) as DurableObjectStateLike["storage"]["put"];
  const storage: DurableObjectStateLike["storage"] = {
    get,
    put,
    async delete(keys: string[]) {
      return keys.filter((k) => map.delete(k)).length;
    },
    async list<T>({ prefix, end }: { prefix: string; end?: string }) {
      const keys = [...map.keys()].filter((k) => k.startsWith(prefix) && (end === undefined || k < end)).sort();
      return new Map(keys.map((k) => [k, structuredClone(map.get(k)) as T]));
    },
  };
  return { map, writes, ctx: { storage } };
}

function setup(now = () => T0) {
  const { map, writes, ctx } = memoryStorage();
  const office = new Office(ctx, {} as OfficeWorkerEnv, now);
  const env: OfficeWorkerEnv = {
    OFFICE_DO: { idFromName: () => "office", get: () => ({ fetch: (input: string, init?: RequestInit) => office.fetch(new Request(input, init)) }) },
    OFFICE_INGEST_KEY: KEY,
    GITHUB_WEBHOOK_SECRET: HOOK,
    OFFICE_REPO_ALLOWLIST: "ShinyQ/*",
  };
  const worker = createOfficeWorker({ now });
  const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://hq-office${path}`, init), env);
  return { map, writes, env, call };
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
    expect([...map.keys()]).toEqual(["doc", "log:2026-10-18"]);
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

  it("drops private repositories and replaces empty titles", async () => {
    const { call } = setup();
    expect((await call("/github", await signedHook("ping", { repository: { ...repository, private: true } }))).status).toBe(204);
    const pr = {
      action: "opened",
      repository,
      sender: { login: "ShinyQ" },
      pull_request: { number: 3, merged: false, title: " <> ", html_url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/3", head: { ref: "fix/z", repo: { full_name: "ShinyQ/ShinyQ-HQ" } } },
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
    const worker = createOfficeWorker({ now: () => T0 });
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
    expect([...map.keys()]).toEqual(["doc", "log:2026-10-18"]);
  });

  it("moves back-row seats stored in `slot` to `seat` on load and writes the document once", async () => {
    const { map, writes, ctx } = memoryStorage();
    const doc = emptyDoc(T0);
    const rec = (n: number, slot: number): SessionRecord => ({ id: n.toString(16).padStart(64, "0"), agent: "codex", slot, firstSeen: T0 + n, lastBeat: T0, state: "working", activity: "editing", since: T0, recent: [] });
    map.set("doc", { ...doc, sessions: [0, 1, 2, 3, 4, 5, 6].map((n) => rec(n, n)) });
    const office = new Office(ctx, {} as OfficeWorkerEnv, () => T0 + 1000);
    const v3 = (await (await office.fetch(new Request("https://office/snapshot?v=3"))).json()) as OfficeSnapshotV3;
    expect(v3.desks.map((d) => d.slot)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const stored = map.get("doc") as OfficeDoc;
    expect(stored.sessions.map((s) => [s.slot, s.seat])).toEqual([[0, undefined], [1, undefined], [2, undefined], [3, undefined], [4, undefined], [null, 5], [null, 6]]);
    await office.fetch(new Request("https://office/snapshot"));
    expect(writes).toEqual([["doc"]]);
  });
});

describe("hq-office Durable Object history", () => {
  const DAY = "2026-10-18";
  const sid = (n: number) => n.toString(16).padStart(64, "0");
  const HEX64 = /[0-9a-f]{64}/;
  function rig(start = T0) {
    const clock = { now: start };
    const store = memoryStorage();
    const make = () => new Office(store.ctx, {} as OfficeWorkerEnv, () => clock.now);
    const beat = (o: Office, n: number, extra: Record<string, unknown> = {}) =>
      o.fetch(new Request("https://office/beat", { method: "POST", body: JSON.stringify({ v: 1, agent: "copilot", session: sid(n), state: "working", activity: "editing", ts: clock.now, ...extra }) }));
    const hook = (o: Office, update: GithubUpdate, delivery: string) => o.fetch(new Request("https://office/github", { method: "POST", body: JSON.stringify({ delivery, update }) }));
    const row = (day: string) => store.map.get(logKey(day)) as DayLog;
    const logKeys = () => [...store.map.keys()].filter((k) => k.startsWith("log:")).sort();
    return { clock, ...store, make, beat, hook, row, logKeys };
  }
  const merge = (n: number, title: string): GithubUpdate => ({ repo: "ShinyQ/ShinyQ-HQ", changes: [{ type: "pr", number: n, branch: "feat/x", title, url: `https://github.com/ShinyQ/ShinyQ-HQ/pull/${n}`, action: "merged" }] });
  const ping: GithubUpdate = { repo: "ShinyQ/ShinyQ-HQ", changes: [] };

  it("writes the doc and today's row in one put on a change, the doc alone on a keepalive, a merge with the doc", async () => {
    const r = rig();
    const o = r.make();
    expect((await r.beat(o, 1)).status).toBe(204);
    expect(r.writes.at(-1)).toEqual(["doc", `log:${DAY}`]);
    r.clock.now += 15_000;
    await r.beat(o, 1);
    expect(r.writes.at(-1)).toEqual(["doc"]);
    r.clock.now += 15_000;
    await r.beat(o, 1, { state: "testing", activity: "testing" });
    expect(r.writes.at(-1)).toEqual(["doc", `log:${DAY}`]);
    expect(r.row(DAY).events.map((e) => OFFICE_STATES[e[3]])).toEqual(["working", "testing"]);
    const before = r.writes.length;
    await r.hook(o, merge(7, "Ship It"), "d-1");
    expect(r.writes.length).toBe(before + 1);
    expect(r.writes.at(-1)).toEqual(["doc", `log:${DAY}`]);
    expect(r.row(DAY).prs).toEqual([[r.row(DAY).prs[0][0], -1, "ShinyQ/ShinyQ-HQ", 7, "Ship It"]]);
    await r.hook(o, merge(7, "Ship It"), "d-1");
    expect(r.writes.length).toBe(before + 1);
  });

  it("logs a back-row session moved to seat 0 when another beat removes a quiet session", async () => {
    const r = rig();
    const o = r.make();
    for (let n = 1; n <= 6; n++) await r.beat(o, n);
    expect(r.row(DAY).events.map((e) => e[2])).toEqual([0, 1, 2, 3, 4, 5]);
    r.clock.now = T0 + 20 * 60_000;
    for (let n = 2; n <= 6; n++) await r.beat(o, n);
    const events = r.row(DAY).events.length;
    r.clock.now = T0 + 31 * 60_000;
    await r.beat(o, 2);
    const log = r.row(DAY);
    const moved = log.events.slice(events).filter((e) => e[1] === 5);
    expect(moved).toEqual([[log.events.at(-1)![0], 5, 0, 0, 0, null, 0]]);
    expect(log.events.find((e) => e[1] === 0)?.[5]).toBe(secondsAt(DAY, T0));
  });

  it("rolls over at the WIB midnight: three rows (the doc, yesterday closed, today with its carry-ins)", async () => {
    const day1 = "2026-10-18";
    const day2 = "2026-10-19";
    const r = rig(dayStart(day2) - 10 * 60_000);
    const o = r.make();
    await r.beat(o, 1);
    expect(r.row(day1).events).toEqual([[85_800, 0, 0, 0, 0, null, 0]]);
    r.clock.now = dayStart(day2) + 10_000;
    await r.beat(o, 2);
    expect(r.writes.at(-1)).toEqual(["doc", `log:${day1}`, `log:${day2}`]);
    expect(r.row(day1).events).toEqual([[85_800, 0, 0, 0, 0, 85_800, 0]]);
    expect(r.row(day2).keys).toEqual([sid(1), sid(2)]);
    expect(r.row(day2).events).toEqual([[0, 0, 0, 0, 0, null, 0], [10, 1, 1, 0, 0, null, 0]]);
    expect(r.logKeys()).toEqual([`log:${day1}`, `log:${day2}`]);
  });

  it("keeps only the 8-day window when rows for 10 earlier days are stored", async () => {
    const r = rig();
    for (let i = 1; i <= 10; i++) {
      const day = historyWindow(T0 - i * 86_400_000)[0];
      r.map.set(logKey(day), emptyLog(day));
    }
    expect(r.logKeys()).toHaveLength(10);
    await r.beat(r.make(), 1);
    expect(r.logKeys()).toEqual(historyWindow(T0).map(logKey).sort());
  });

  it("appends to the stored row after a cold start mid-day", async () => {
    const r = rig();
    await r.beat(r.make(), 1);
    r.clock.now += 60_000;
    await r.beat(r.make(), 2);
    expect(r.row(DAY).keys).toEqual([sid(1), sid(2)]);
    expect(r.row(DAY).events.map((e) => e[1])).toEqual([0, 1]);
  });

  it("scrubs a privatized repository from every stored row", async () => {
    const r = rig();
    const o = r.make();
    const past = historyWindow(T0 - 86_400_000)[0];
    r.map.set(logKey(past), { ...emptyLog(past), keys: [sid(9)], agents: ["codex"], tasks: { 0: { repo: "ShinyQ/ShinyQ-HQ", title: "Old Secret Task" } }, events: [[0, 0, 0, 0, 0, 60, 0]], prs: [[30, 0, "ShinyQ/ShinyQ-HQ", 3, "Old Secret Merge"]] });
    await r.hook(o, ping, "d-0");
    await r.beat(o, 1, { repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x", title: "Secret Task" });
    await r.hook(o, merge(8, "Secret Merge"), "d-1");
    expect(JSON.stringify(r.row(DAY))).toContain("Secret Task");
    expect(JSON.stringify(r.row(DAY))).toContain("Secret Merge");
    expect((await r.hook(o, { repo: "ShinyQ/ShinyQ-HQ", changes: [{ type: "privatized" }] }, "d-2")).status).toBe(204);
    for (const key of r.logKeys()) {
      const text = JSON.stringify(r.map.get(key));
      expect(text, key).not.toContain("ShinyQ/ShinyQ-HQ");
      expect(text, key).not.toContain("Secret");
    }
    expect(r.row(past).prs).toEqual([[30, 0, "", 3, ""]]);
    const served = await (await o.fetch(new Request(`https://office/history?day=${DAY}`))).text();
    expect(served).not.toContain("Secret");
  });

  it("closes the last active day after a quiet day, from the stored doc, on a cold start", async () => {
    const fri = "2026-10-16";
    const r = rig(dayStart(fri) + 21 * 3_600_000);
    const o = r.make();
    for (let m = 0; m <= 30; m++) {
      r.clock.now = dayStart(fri) + 21 * 3_600_000 + m * 60_000;
      await r.beat(o, 1);
    }
    r.clock.now = dayStart(DAY) + 10 * 3_600_000;
    const sunday = r.make();
    await r.beat(sunday, 2);
    expect(r.row(fri).events).toEqual([[75_600, 0, 0, 0, 0, 77_400, 0]]);
    const served = (await (await sunday.fetch(new Request(`https://office/history?day=${fri}`))).json()) as OfficeHistoryV1;
    expect(served.events).toEqual([[75_600, 0, 0, 0, 0, 77_400, 0]]);
  });

  it("scrubs a privatize that is the first write of a new day in the same put as the doc", async () => {
    const day1 = "2026-10-17";
    const r = rig(dayStart(DAY) - 10 * 60_000);
    const o = r.make();
    await r.hook(o, ping, "d-0");
    await r.beat(o, 1, { repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x", title: "Secret plan" });
    expect(JSON.stringify(r.row(day1))).toContain("Secret plan");
    r.clock.now = dayStart(DAY) + 5 * 60_000;
    const writes = r.writes.length;
    expect((await r.hook(o, { repo: "ShinyQ/ShinyQ-HQ", changes: [{ type: "privatized" }] }, "d-1")).status).toBe(204);
    expect(r.logKeys()).toEqual([`log:${day1}`, `log:${DAY}`]);
    for (const key of r.logKeys()) {
      const text = JSON.stringify(r.map.get(key));
      expect(text, key).not.toContain("ShinyQ/ShinyQ-HQ");
      expect(text, key).not.toContain("Secret");
    }
    expect(r.writes.length).toBe(writes + 1);
    expect(r.writes.at(-1)).toEqual(["doc", `log:${day1}`, `log:${DAY}`]);
  });

  it("serves the index and any day in the window, read-only, 404 outside it, never a session hash", async () => {
    const r = rig();
    const o = r.make();
    const past = historyWindow(T0 - 2 * 86_400_000)[0];
    const empty = historyWindow(T0 - 86_400_000)[0];
    r.map.set(logKey(past), { ...emptyLog(past), keys: [sid(9)], agents: ["claude"], events: [[100, 0, 3, 0, 0, null, 2]] });
    for (let n = 1; n <= 3; n++) await r.beat(o, n, { helpers: n });
    const writes = r.writes.length;
    const texts: string[] = [];
    const get = async (q: string) => {
      const res = await o.fetch(new Request(`https://office/history${q}`));
      texts.push(await res.clone().text());
      return res;
    };
    const index = await (await get("")).json();
    expect(parseOfficeHistoryIndex(index)).not.toBeNull();
    expect(index).toEqual(historyIndex(historyWindow(T0), new Map([[logKey(DAY), r.row(DAY)], [logKey(past), r.row(past)]])));
    expect(index.days[0]).toEqual({ day: DAY, events: 3, prs: 0, runs: 0, deploys: 0 });
    const today = (await (await get(`?day=${DAY}`)).json()) as OfficeHistoryV1;
    expect(parseOfficeHistory(today)).toEqual(today);
    expect(today).toMatchObject({ day: DAY, start: dayStart(DAY), agents: ["copilot", "copilot", "copilot"] });
    expect(today.events.map((e) => e[6])).toEqual([1, 2, 3]);
    const old = (await (await get(`?day=${past}`)).json()) as OfficeHistoryV1;
    expect(parseOfficeHistory(old)).toEqual(old);
    expect(old.events).toEqual([[100, 0, 3, 0, 0, 100, 2]]);
    const none = (await (await get(`?day=${empty}`)).json()) as OfficeHistoryV1;
    expect(parseOfficeHistory(none)).toEqual(none);
    expect(none).toMatchObject({ day: empty, agents: [], events: [] });
    for (const q of [`?day=${historyWindow(T0 - 8 * 86_400_000)[0]}`, "?day=2026-10-19", "?day=x", "?day=", `?day=${DAY}x`]) expect((await get(q)).status, q).toBe(404);
    expect((await o.fetch(new Request("https://office/history", { method: "POST", body: "{}" }))).status).toBe(405);
    expect(r.writes.length).toBe(writes);
    for (const text of texts) expect(text).not.toMatch(HEX64);
  });
});

describe("hq-office Worker history route", () => {
  const DAY = "2026-10-18";

  it("forwards no query for the index and a well-formed day alone; anything else is a 404 that never reaches the Durable Object", async () => {
    const seen: string[] = [];
    const env: OfficeWorkerEnv = {
      OFFICE_DO: { idFromName: () => "office", get: () => ({ fetch: async (input: string) => (seen.push(input), Response.json(input.includes("?day=") ? { ...historyDay(emptyLog(DAY), emptyDoc(T0)) } : { v: 1, days: [] })) }) },
    };
    const worker = createOfficeWorker({ now: () => T0 });
    const get = (q: string, init?: RequestInit) => worker.fetch(new Request(`https://hq-office/history${q}`, init), env);
    expect((await get("")).status).toBe(200);
    expect((await get(`?day=${DAY}`)).status).toBe(200);
    for (const q of ["?day=x", "?foo=1", "?day=", `?day=${DAY}x`, `?day=${DAY}&foo=1`, `?day=${DAY}&day=${DAY}`, `?DAY=${DAY}`, "?day=%3Cscript%3E"]) {
      const res = await get(q);
      expect(res.status, q).toBe(404);
      expect(res.headers.get("Cache-Control"), q).toBe("no-store");
    }
    for (const method of ["POST", "PUT", "DELETE"]) {
      const res = await get("", { method });
      expect(res.status, method).toBe(405);
      expect(res.headers.get("Cache-Control"), method).toBe("no-store");
    }
    expect(seen).toEqual(["https://office/history", `https://office/history?day=${DAY}`]);
  });

  it("cleans a day again (allowlist, titles) and passes a Durable Object 404 through with no-store", async () => {
    const { map, call } = setup();
    map.set("doc", { ...emptyDoc(T0), publicRepos: ["ShinyQ/ShinyQ-HQ", "Other/repo"] });
    map.set(logKey(DAY), {
      ...emptyLog(DAY),
      keys: ["a".repeat(64), "b".repeat(64), "c".repeat(64)],
      agents: ["copilot", "codex", "claude"],
      tasks: { 0: { repo: "ShinyQ/ShinyQ-HQ", title: " <> " }, 1: { repo: "Other/repo", title: "Hidden Work" }, 2: { repo: "ShinyQ/ShinyQ-HQ", title: "Ship The Lobby" } },
      events: [[0, 0, 0, 0, 0, 60, 0], [0, 1, 1, 0, 0, 60, 0], [0, 2, 2, 0, 0, 60, 0]],
      prs: [[30, 0, "ShinyQ/ShinyQ-HQ", 3, "<>"], [31, 1, "Other/repo", 4, "Hidden Merge"], [32, 2, "ShinyQ/ShinyQ-HQ", 5, "Lobby Tiles"]],
    } satisfies DayLog);
    const res = await call(`/history?day=${DAY}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    const day = parseOfficeHistory(await res.json()) as OfficeHistoryV1;
    expect(day.tasks).toEqual({ 0: { repo: "ShinyQ/ShinyQ-HQ" }, 2: { repo: "ShinyQ/ShinyQ-HQ", title: "Ship The Lobby" } });
    expect(day.prs).toEqual([[30, 0, "", 3, ""], [31, 1, "", 4, ""], [32, 2, "ShinyQ/ShinyQ-HQ", 5, "Lobby Tiles"]]);
    const index = await call("/history");
    const indexed = parseOfficeHistoryIndex(await index.json());
    expect(indexed && "days" in indexed ? indexed.days[0] : null).toEqual({ day: DAY, events: 3, prs: 3, runs: 0, deploys: 0 });
    const outside = await call(`/history?day=${historyWindow(T0 - 8 * 86_400_000)[0]}`);
    expect(outside.status).toBe(404);
    expect(outside.headers.get("Cache-Control")).toBe("no-store");
  });
});

const secondsAt = (day: string, ms: number) => Math.floor((ms - dayStart(day)) / 1000);
