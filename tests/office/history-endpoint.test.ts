import { beforeEach, describe, expect, it } from "vitest";
import { wibDay } from "@/lib/office/protocol";
import { historyWindow, parseOfficeHistory, parseOfficeHistoryIndex } from "@/lib/office/protocolHistory";
import { createOfficeHistoryHandler, historyRoute } from "../../functions/_lib/office";
import type { OfficeEnv } from "../../functions/_lib/types";
import { emptyLog, historyDay, historyIndex, logKey, type DayLog } from "../../workers/office/src/history";
import { emptyDoc } from "../../workers/office/src/state";
import { ctx, memoryCache, worker as fakeWorker } from "../helpers/office-endpoint";

const NOW = Date.UTC(2026, 9, 18, 8, 0, 0);

/** An enabled office whose Worker answers the index and any day from a small stored log (or `history`, or `historyStatus`). */
function officeEnv(opts: { history?: (path: string) => unknown; historyStatus?: number; throws?: boolean } = {}) {
  const today = wibDay(NOW);
  const row: DayLog = { ...emptyLog(today), keys: ["a".repeat(64)], agents: ["copilot"], events: [[60, 0, 0, 0, 0, null, 1]] };
  const w = fakeWorker((path) => {
    if (opts.throws) return Promise.reject(new Error("down"));
    if (opts.historyStatus) return new Response(null, { status: opts.historyStatus });
    if (opts.history) return Response.json(opts.history(path));
    const day = new URL(`https://hq-office${path}`).searchParams.get("day");
    if (day === null) return Response.json(historyIndex(historyWindow(NOW), new Map([[logKey(today), row]])));
    return Response.json(historyDay(day === today ? row : emptyLog(day), emptyDoc(NOW)));
  });
  const env: OfficeEnv = { OFFICE_ENABLED: "true", OFFICE: w.binding };
  return Object.assign(env, { calls: w.calls });
}

describe("GET /api/office/history", () => {
  let env: ReturnType<typeof officeEnv>;
  let cache: ReturnType<typeof memoryCache>["cache"];
  let worker: { calls: () => number };
  beforeEach(() => {
    env = officeEnv();
    cache = memoryCache().cache;
    worker = { calls: () => env.calls.length };
  });

  it("serves the index and a day with ETag and caching; junk is a 404 without echo", async () => {
    const h = createOfficeHistoryHandler({ cache: () => cache, now: () => NOW });
    const index = await h(ctx("https://x/api/office/history", env));
    expect(index.status).toBe(200);
    expect(index.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(index.headers.get("Cache-Control")).toBe("public, max-age=30, stale-while-revalidate=60");
    const today = await h(ctx(`https://x/api/office/history?day=${wibDay(NOW)}`, env));
    expect(today.headers.get("Cache-Control")).toBe("public, max-age=30, stale-while-revalidate=60");
    const pastDay = wibDay(NOW - 2 * 86_400_000);
    const past = await h(ctx(`https://x/api/office/history?day=${pastDay}`, env));
    expect(past.headers.get("Cache-Control")).toBe("public, max-age=3600, stale-while-revalidate=300");
    const etag = past.headers.get("ETag")!;
    expect((await h(ctx(`https://x/api/office/history?day=${pastDay}`, env, { "If-None-Match": etag }))).status).toBe(304);
    for (const q of ["?day=2020-01-01", "?day=%3Cscript%3E", `?day=${wibDay(NOW)}&x=1`, `?day=${wibDay(NOW)}&day=${pastDay}`, "?foo=bar", `?DAY=${wibDay(NOW)}`]) {
      const r = await h(ctx(`https://x/api/office/history${q}`, env));
      expect(r.status).toBe(404);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      expect(await r.text()).toBe('{"v":1,"error":"day"}');
    }
    expect(cache.keys().every((k) => /\/api\/office\/history(\?day=\d{4}-\d{2}-\d{2})?$/.test(k))).toBe(true);
    expect(worker.calls()).toBe(3);
  });

  it("answers disabled when the office is off, and 503 when the Worker is missing, down or invalid", async () => {
    const h = createOfficeHistoryHandler({ cache: () => null, now: () => NOW });
    expect(await (await h(ctx("https://x/api/office/history", { ...env, OFFICE_ENABLED: "false" }))).json()).toEqual({ v: 1, enabled: false });
    expect((await h(ctx("https://x/api/office/history", { ...env, OFFICE: undefined }))).status).toBe(503);
    const bad = officeEnv({ history: () => ({ v: 1, day: "x" }) });
    const r = await h(ctx(`https://x/api/office/history?day=${wibDay(NOW)}`, bad));
    expect(r.status).toBe(503);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const gone = officeEnv({ historyStatus: 404 });
    expect((await h(ctx(`https://x/api/office/history?day=${wibDay(NOW)}`, gone))).status).toBe(404);
    expect((await h(ctx("https://x/api/office/history", gone))).status).toBe(503);
  });

  it("answers HEAD with headers only and rejects other methods", async () => {
    const h = createOfficeHistoryHandler({ cache: () => null, now: () => NOW });
    const head = await h(ctx("https://x/api/office/history", env, {}, "HEAD"));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await h(ctx("https://x/api/office/history", env, {}, "POST"))).status).toBe(405);
  });

  it("serves validated bodies with no session hash, a 503 for a thrown or 500 Worker, and nothing cached on a failure", async () => {
    const h = createOfficeHistoryHandler({ cache: () => cache, now: () => NOW });
    const index = await (await h(ctx("https://x/api/office/history", env))).text();
    expect(parseOfficeHistoryIndex(JSON.parse(index))).not.toBeNull();
    const day = await (await h(ctx(`https://x/api/office/history?day=${wibDay(NOW)}`, env))).text();
    expect(parseOfficeHistory(JSON.parse(day))).toMatchObject({ day: wibDay(NOW), events: [[60, 0, 0, 0, 0, 60, 1]] });
    for (const text of [index, day]) expect(text).not.toMatch(/[0-9a-f]{64}/);
    const fresh = memoryCache().cache;
    const failing = createOfficeHistoryHandler({ cache: () => fresh, now: () => NOW });
    for (const broken of [officeEnv({ throws: true }), officeEnv({ historyStatus: 500 }), officeEnv({ history: () => ({ v: 1, days: [] }) })]) {
      const r = await failing(ctx("https://x/api/office/history", broken));
      expect(r.status).toBe(503);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(fresh.keys()).toEqual([]);
  });

  it("never answers 304 across days: each day has its own key and ETag", async () => {
    const h = createOfficeHistoryHandler({ cache: () => cache, now: () => NOW });
    const [d0, d1, d2] = historyWindow(NOW);
    const tags: string[] = [];
    for (const d of [d0, d1, d2]) tags.push((await h(ctx(`https://x/api/office/history?day=${d}`, env))).headers.get("ETag")!);
    expect(new Set(tags).size).toBe(3);
    const other = await h(ctx(`https://x/api/office/history?day=${d2}`, env, { "If-None-Match": tags[1] }));
    expect(other.status).toBe(200);
    expect((await other.json()).day).toBe(d2);
    expect(cache.keys()).toEqual(["https://x/api/office/history?day=" + d0, "https://x/api/office/history?day=" + d1, "https://x/api/office/history?day=" + d2]);
  });

  it("routes only the canonical forms inside the WIB window", () => {
    const [today, , , , , , , oldest] = historyWindow(NOW);
    expect(historyRoute(new URL("https://x/api/office/history"), NOW)).toMatchObject({ key: "/api/office/history", worker: "https://hq-office/history" });
    expect(historyRoute(new URL(`https://x/api/office/history?day=${today}`), NOW)).toMatchObject({ key: `/api/office/history?day=${today}`, cache: "public, max-age=30, stale-while-revalidate=60" });
    expect(historyRoute(new URL(`https://x/api/office/history?day=${oldest}`), NOW)).toMatchObject({ worker: `https://hq-office/history?day=${oldest}`, cache: "public, max-age=3600, stale-while-revalidate=300" });
    expect(historyRoute(new URL(`https://x/api/office/history?day=${wibDay(NOW - 8 * 86_400_000)}`), NOW)).toBeNull();
    expect(historyRoute(new URL(`https://x/api/office/history?day=${wibDay(NOW + 86_400_000)}`), NOW)).toBeNull();
    // A day that is today before the WIB midnight is a past day just after it.
    const late = Date.parse(`${today}T16:59:59Z`);
    expect(historyRoute(new URL(`https://x/api/office/history?day=${today}`), late)?.cache).toBe("public, max-age=30, stale-while-revalidate=60");
    expect(historyRoute(new URL(`https://x/api/office/history?day=${today}`), late + 1000)?.cache).toBe("public, max-age=3600, stale-while-revalidate=300");
  });
});
