import { describe, expect, it, vi } from "vitest";
import { DELAYED_AFTER_MS } from "@/lib/visits/model";
import { STATS_FIXTURE } from "@/lib/stats/fixtures";
import { askCheck, checkWithRetry, deployCheck, pageCheck, runChecks, statsCheck, STATS_MAX_AGE_MS, RETRY_DELAY_MS, type UptimeDeps } from "../../scripts/uptime";

const OG = '<html><head><link rel="canonical" href="https://x/en"><meta property="og:title" content="T"><meta property="og:image" content="https://x/og.jpg"><meta property="og:url" content="https://x/en"></head></html>';
const NOW = Date.parse("2026-10-15T10:00:00Z");

describe("pageCheck", () => {
  it("passes on 200 with og:title, og:image and og:url", () => expect(pageCheck("en", { code: 200, html: OG }).ok).toBe(true));
  it("fails on a non-200", () => expect(pageCheck("home", { code: 500, html: OG })).toMatchObject({ ok: false, detail: expect.stringContaining("HTTP 500") }));
  it("names missing og tags", () => expect(pageCheck("en", { code: 200, html: "<html></html>" }).detail).toContain("og:title"));
  it("fails on a network error", () => expect(pageCheck("en", { error: "timeout" })).toMatchObject({ ok: false, detail: expect.stringContaining("timeout") }));
});

describe("askCheck", () => {
  it("passes when enabled", () => expect(askCheck({ code: 200, body: { enabled: true, asOf: "2026-10-15" } })).toMatchObject({ ok: true, detail: expect.stringContaining("2026-10-15") }));
  it("passes with a note when the kill switch is off", () => expect(askCheck({ code: 503, body: { enabled: false } })).toMatchObject({ ok: true, detail: expect.stringContaining("kill switch") }));
  it("fails on a 503 without the status body", () => expect(askCheck({ code: 503 }).ok).toBe(false));
  it("fails on a 404", () => expect(askCheck({ code: 404 }).ok).toBe(false));
});

describe("statsCheck", () => {
  const fresh = { ...STATS_FIXTURE, updatedAt: "2026-10-15T00:00:00.000Z" };
  it("uses the site's delayed threshold", () => expect(STATS_MAX_AGE_MS).toBe(DELAYED_AFTER_MS));
  it("passes a fresh snapshot", () => expect(statsCheck({ code: 200, body: fresh }, NOW).ok).toBe(true));
  it("fails a stale snapshot", () => expect(statsCheck({ code: 200, body: { ...fresh, updatedAt: "2026-10-12T00:00:00.000Z" } }, NOW)).toMatchObject({ ok: false, detail: expect.stringContaining("old") }));
  it("fails on 204", () => expect(statsCheck({ code: 204 }, NOW).ok).toBe(false));
  it("fails on an invalid body", () => expect(statsCheck({ code: 200, body: { v: 9 } }, NOW).ok).toBe(false));
});

describe("deployCheck", () => {
  const run = (conclusion: string, url = "u") => ({ status: "completed", conclusion, html_url: url, created_at: "2026-10-15T09:00:00Z" });
  it("passes when the newest result is success", () => expect(deployCheck({ runs: [run("success")] }).ok).toBe(true));
  it("skips cancelled and skipped runs", () => expect(deployCheck({ runs: [run("cancelled"), run("skipped"), run("success")] }).ok).toBe(true));
  it("fails on a failed deploy and links it", () => expect(deployCheck({ runs: [run("failure", "https://run/1"), run("success")] })).toMatchObject({ ok: false, detail: expect.stringContaining("https://run/1") }));
  it("fails with no runs", () => expect(deployCheck({ runs: [] }).ok).toBe(false));
  it("fails when the API errors", () => expect(deployCheck({ error: "HTTP 403" }).ok).toBe(false));
});

function fakeFetch(routes: Record<string, () => Response>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`unexpected ${url}`);
    return routes[key]();
  }) as unknown as typeof fetch;
}
const healthy = () => ({
  "pages.dev/?": () => new Response(OG, { status: 200 }),
  "pages.dev/en?": () => new Response(OG, { status: 200 }),
  "/api/ask": () => Response.json({ enabled: true, asOf: "2026-10-15" }),
  "/api/stats": () => Response.json({ ...STATS_FIXTURE, updatedAt: "2026-10-15T00:00:00.000Z" }),
  "deploy.yml/runs": () => Response.json({ workflow_runs: [{ status: "completed", conclusion: "success", html_url: "u", created_at: "x" }] }),
});
const deps = (fetch: typeof fetch): UptimeDeps => ({ fetch, site: "https://kurniadi.pages.dev", repo: "o/r", token: "t", now: () => NOW });

describe("runChecks and checkWithRetry", () => {
  it("runs every check against production", async () => {
    const results = await runChecks(deps(fakeFetch(healthy())));
    expect(results.map((r) => [r.id, r.ok])).toEqual([["home", true], ["en", true], ["ask", true], ["stats", true], ["deploy", true]]);
  });

  it("retries only failing checks once after 60 s and keeps a recovered check green", async () => {
    let askCalls = 0;
    const routes = { ...healthy(), "/api/ask": () => (++askCalls === 1 ? new Response("down", { status: 502 }) : Response.json({ enabled: true, asOf: "d" })) };
    const sleep = vi.fn(async () => {});
    const results = await checkWithRetry(deps(fakeFetch(routes)), { forceFail: false, sleep });
    expect(sleep).toHaveBeenCalledWith(RETRY_DELAY_MS);
    expect(askCalls).toBe(2);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("does not wait when everything passes", async () => {
    const sleep = vi.fn(async () => {});
    await checkWithRetry(deps(fakeFetch(healthy())), { forceFail: false, sleep });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("adds the forced failure without retrying it", async () => {
    const sleep = vi.fn(async () => {});
    const results = await checkWithRetry(deps(fakeFetch(healthy())), { forceFail: true, sleep });
    expect(sleep).not.toHaveBeenCalled();
    expect(results.filter((r) => !r.ok).map((r) => r.id)).toEqual(["forced"]);
  });

  it("turns a thrown fetch into a failed check", async () => {
    const routes = { ...healthy(), "/api/stats": () => { throw new Error("ECONNRESET"); } };
    const results = await checkWithRetry(deps(fakeFetch(routes)), { forceFail: false, sleep: async () => {} });
    expect(results.find((r) => r.id === "stats")).toMatchObject({ ok: false, detail: expect.stringContaining("ECONNRESET") });
  });
});
