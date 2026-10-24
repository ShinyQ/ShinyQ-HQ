import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { createStatsHandler, resetLiveCounts } from "../functions/_lib/stats";
import type { AnalyticsEngineDataset, KvNamespace, StatsEnv, VisitEnv } from "../functions/_lib/types";
import { createVisitHandler, resetVisitWindow } from "../functions/_lib/visit";
import { STATS_LIVE_KEY } from "../src/lib/stats/live";
import { STATS_KEY } from "../src/lib/stats/protocol";
import { STATS_FIXTURE } from "../src/lib/visits/contract";
import { openPage } from "./hq";

/**
 * Accurate visit counting (owner decision 2026-10-24): a fresh tab's visit ping raises the live number on the
 * site. The local static server has no Functions, so `/api/visit` and `/api/stats` are routed to the real
 * Pages Function handlers (functions/_lib/visit.ts and stats.ts) over in-memory stand-ins: Analytics Engine
 * keeps the written points, KV holds the hourly snapshot and its live tail, and the hq-stats service binding
 * counts the visit pings written since the tail's start (what `GET /live` asks Analytics Engine in production).
 * Playwright is automation, so pages that should count force it with `?visit=1`.
 */

type Point = Parameters<AnalyticsEngineDataset["writeDataPoint"]>[0];

function fakeBackend() {
  const points: Point[] = [];
  const updatedAt = new Date(Date.now() - 20 * 60_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const kv: KvNamespace = {
    async get(key) {
      if (key === STATS_KEY) return JSON.stringify({ ...STATS_FIXTURE, updatedAt });
      if (key === STATS_LIVE_KEY) return JSON.stringify({ v: 1, updatedAt, from: `${today}T00:00:00Z`, visits: 0 });
      return null;
    },
    async put() {
      throw new Error("read only");
    },
  };
  const visitPings = () => points.filter((p) => p.blobs?.[1] === "visit").length;
  const visitEnv: VisitEnv = { STATS_ENABLED: "true", VISIT_EVENTS: { writeDataPoint: (p) => points.push(p) } };
  const statsEnv: StatsEnv = { STATS_ENABLED: "true", STATS_KV: kv, STATS: { fetch: async () => Response.json({ n: visitPings() }) } };
  const visit = createVisitHandler();
  const stats = createStatsHandler();

  async function serve(route: Route, handle: (ctx: { request: Request; env: never; waitUntil: () => void }) => Promise<Response>, env: unknown) {
    const r = route.request();
    const request = new Request(r.url(), { method: r.method(), headers: r.headers(), body: r.method() === "POST" ? (r.postData() ?? "") : undefined });
    const res = await handle({ request, env: env as never, waitUntil: () => undefined });
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: res.status === 204 || res.status === 304 ? undefined : await res.text() });
  }

  async function install(context: BrowserContext) {
    resetVisitWindow();
    await context.route("**/api/visit", (route) => serve(route, visit as never, visitEnv));
    await context.route("**/api/stats", (route) => {
      // One isolate reuses a live count for 30 s; a fresh one per request keeps the test on state, not time.
      resetLiveCounts();
      return serve(route, stats as never, statsEnv);
    });
  }
  return { install, visitPings, modePings: () => points.filter((p) => p.blobs?.[1] !== "visit").length };
}

const shown = (page: Page) => page.locator("#visits").getByTestId("visits-status");
const visitsText = (n: number) => `${n.toLocaleString("en-US")} visits`;

test("a fresh tab's visit raises the live visit count; a reload in the same tab does not", async ({ context }) => {
  test.setTimeout(90_000);
  const backend = fakeBackend();
  await backend.install(context);
  const base = STATS_FIXTURE.visits.all;

  // A reader that never counts itself (?visit=0) shows the hourly snapshot.
  const reader = await context.newPage();
  await openPage(reader, "/en/contact?tier=static&visit=0#visits");
  await expect(shown(reader)).toContainText(visitsText(base));

  // A fresh tab sends its visit ping as soon as it is shown.
  const visitor = await context.newPage();
  await openPage(visitor, "/en/quick?tier=static&visit=1");
  await expect.poll(backend.visitPings, { timeout: 30_000 }).toBe(1);
  await reader.reload();
  await expect(shown(reader)).toContainText(visitsText(base + 1));

  // A reload in the same tab is the same session: its beacon runs (the mode ping proves it) but no new visit.
  await visitor.reload();
  await expect
    .poll(
      async () => {
        await visitor.evaluate(() => window.dispatchEvent(new Event("pagehide")));
        return backend.modePings();
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  expect(backend.visitPings()).toBe(1);

  // Another fresh tab counts again.
  const second = await context.newPage();
  await openPage(second, "/en/quick?tier=static&visit=1");
  await expect.poll(backend.visitPings, { timeout: 30_000 }).toBe(2);
  await reader.reload();
  await expect(shown(reader)).toContainText(visitsText(base + 2));
});
