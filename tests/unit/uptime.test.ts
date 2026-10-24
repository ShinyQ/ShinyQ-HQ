import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DELAYED_AFTER_MS } from "@/lib/visits/model";
import { STATS_FIXTURE } from "@/lib/stats/fixtures";
import { applyIssueAction, askCheck, askExpectedEnabled, checkWithRetry, deployCheck, failingFromBody, findOpenIssue, githubClient, type GitHubCall, issueAction, ISSUE_TITLE, pageCheck, runChecks, statsCheck, summaryMarkdown, STATS_MAX_AGE_MS, RETRY_DELAY_MS, type CheckId, type UptimeDeps } from "../../scripts/uptime";

const OG = '<html><head><link rel="canonical" href="https://x/en"><meta property="og:title" content="T"><meta property="og:image" content="https://x/og.jpg"><meta property="og:url" content="https://x/en"></head></html>';
const NOW = Date.parse("2026-10-15T10:00:00Z");

describe("pageCheck", () => {
  it("passes on 200 with og:title, og:image and og:url", () => expect(pageCheck("en", { code: 200, html: OG }).ok).toBe(true));
  it("fails on a non-200", () => expect(pageCheck("home", { code: 500, html: OG })).toMatchObject({ ok: false, detail: expect.stringContaining("HTTP 500") }));
  it("names missing og tags", () => expect(pageCheck("en", { code: 200, html: "<html></html>" }).detail).toContain("og:title"));
  it("fails when Cloudflare injects its own Web Analytics beacon", () =>
    expect(pageCheck("en", { code: 200, html: `${OG}<!-- Cloudflare Pages Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{}'></script>` })).toMatchObject({
      ok: false,
      detail: expect.stringContaining("Cloudflare-injected Web Analytics beacon"),
    }));
  it("fails on a network error", () => expect(pageCheck("en", { error: "timeout" })).toMatchObject({ ok: false, detail: expect.stringContaining("timeout") }));
});

describe("askCheck", () => {
  it("passes when enabled", () => expect(askCheck({ code: 200, body: { enabled: true, asOf: "2026-10-15" } }, true)).toMatchObject({ ok: true, detail: expect.stringContaining("2026-10-15") }));
  it("passes a 503 with a note when wrangler.toml switched Ask off", () => expect(askCheck({ code: 503, body: { enabled: false } }, false)).toMatchObject({ ok: true, detail: expect.stringContaining("kill switch") }));
  it("fails a disabled Ask while wrangler.toml expects it enabled", () => expect(askCheck({ code: 503, body: { enabled: false } }, true)).toMatchObject({ ok: false, detail: expect.stringContaining("wrangler.toml") }));
  it("fails on a 503 without the status body", () => expect(askCheck({ code: 503 }, false).ok).toBe(false));
  it("fails on a 404", () => expect(askCheck({ code: 404 }, true).ok).toBe(false));
});

describe("askExpectedEnabled", () => {
  it("is true for ASK_ENABLED = \"true\"", () => expect(askExpectedEnabled('[vars]\nASK_ENABLED = "true"\n')).toBe(true));
  it("is false for ASK_ENABLED = \"false\"", () => expect(askExpectedEnabled('ASK_ENABLED = "false"')).toBe(false));
  it("is false without the line", () => expect(askExpectedEnabled('ASK_PRIMARY = "x"')).toBe(false));
  it("reads true from the real wrangler.toml", () => expect(askExpectedEnabled(readFileSync("wrangler.toml", "utf8"))).toBe(true));
});

describe("statsCheck", () => {
  const fresh = { ...STATS_FIXTURE, updatedAt: "2026-10-15T08:17:00.000Z" };
  it("uses the site's delayed threshold", () => expect(STATS_MAX_AGE_MS).toBe(DELAYED_AFTER_MS));
  it("allows 3 missed hourly runs", () => expect(STATS_MAX_AGE_MS).toBe(3 * 3_600_000));
  it("passes a fresh snapshot", () => expect(statsCheck({ code: 200, body: fresh }, NOW).ok).toBe(true));
  it("fails a stale snapshot", () => expect(statsCheck({ code: 200, body: { ...fresh, updatedAt: "2026-10-12T00:00:00.000Z" } }, NOW)).toMatchObject({ ok: false, detail: expect.stringContaining("old") }));
  it("passes at exactly 6 h old", () => expect(statsCheck({ code: 200, body: { ...fresh, updatedAt: new Date(NOW - STATS_MAX_AGE_MS).toISOString() } }, NOW).ok).toBe(true));
  it("fails at 6 h plus one minute", () => expect(statsCheck({ code: 200, body: { ...fresh, updatedAt: new Date(NOW - STATS_MAX_AGE_MS - 60_000).toISOString() } }, NOW).ok).toBe(false));
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
  "/api/stats": () => Response.json({ ...STATS_FIXTURE, updatedAt: "2026-10-15T08:17:00.000Z" }),
  "deploy.yml/runs": () => Response.json({ workflow_runs: [{ status: "completed", conclusion: "success", html_url: "u", created_at: "x" }] }),
});
const deps = (fetchImpl: typeof fetch): UptimeDeps => ({ fetch: fetchImpl, site: "https://kurniadi.pages.dev", repo: "o/r", token: "t", now: () => NOW });

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

  it("keeps a check that fails on both attempts failed", async () => {
    let askCalls = 0;
    const routes = { ...healthy(), "/api/ask": () => (++askCalls, new Response("down", { status: 502 })) };
    const results = await checkWithRetry(deps(fakeFetch(routes)), { forceFail: false, sleep: async () => {} });
    expect(askCalls).toBe(2);
    expect(results.find((r) => r.id === "ask")?.ok).toBe(false);
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

describe("issueAction", () => {
  const ctx = { site: "https://kurniadi.pages.dev", runUrl: "https://github.com/o/r/actions/runs/1", checkedAt: "2026-10-15T10:17:00Z" };
  const ok = (id: CheckId) => ({ id, ok: true, detail: "fine" });
  const bad = (id: CheckId, detail = "HTTP 502 | gateway") => ({ id, ok: false, detail });

  it("does nothing when all pass and no issue is open", () => expect(issueAction([ok("home"), ok("ask")], null, ctx)).toEqual({ kind: "none" }));

  it("opens one labelled issue listing only the failing checks", () => {
    const action = issueAction([ok("home"), bad("ask"), bad("stats", "stale")], null, ctx);
    expect(action).toMatchObject({ kind: "open", title: ISSUE_TITLE });
    const body = (action as { body: string }).body;
    expect(body).toContain("<!-- uptime:failing=ask,stats -->");
    expect(body).toContain("GET /api/ask status");
    expect(body).not.toContain("Page /");
    expect(body).toContain("HTTP 502 \\| gateway");
    expect(body).toContain(ctx.runUrl);
    expect(body).not.toMatch(/\u2014/);
  });

  it("updates the body silently while the same checks keep failing", () => {
    const open = { number: 7, body: "<!-- uptime:failing=ask -->\nold" };
    const action = issueAction([bad("ask")], open, ctx);
    expect(action).toMatchObject({ kind: "update", number: 7 });
    expect((action as { comment?: string }).comment).toBeUndefined();
  });

  it("comments when the failing set changes", () => {
    const open = { number: 7, body: "<!-- uptime:failing=ask -->" };
    const action = issueAction([bad("ask"), bad("deploy")], open, ctx) as { comment?: string };
    expect(action.comment).toContain("Latest deploy.yml run on main");
  });

  it("closes with a recovery comment when every check passes", () => {
    const action = issueAction([ok("home"), ok("en")], { number: 7, body: "" }, ctx);
    expect(action).toMatchObject({ kind: "close", number: 7, comment: expect.stringContaining("All production checks pass again") });
  });

  it("reads the failing set back from the marker", () => {
    expect(failingFromBody("x\n<!-- uptime:failing=ask,stats -->")).toEqual(["ask", "stats"]);
    expect(failingFromBody("no marker")).toBeNull();
  });
});

describe("applyIssueAction and findOpenIssue", () => {
  function fakeGh(responses: Record<string, { status: number; data: unknown }> = {}) {
    const calls: [string, string, unknown?][] = [];
    const gh: GitHubCall = async (method, path, body) => {
      calls.push(body === undefined ? [method, path] : [method, path, body]);
      return responses[`${method} ${path.split("?")[0]}`] ?? { status: 200, data: {} };
    };
    return { gh, calls };
  }

  it("finds the open uptime issue and ignores pull requests", async () => {
    const { gh, calls } = fakeGh({ "GET /repos/o/r/issues": { status: 200, data: [{ number: 3, body: "b", pull_request: {} }, { number: 5, body: "c" }] } });
    expect(await findOpenIssue(gh, "o/r")).toEqual({ number: 5, body: "c" });
    expect(calls[0][1]).toBe("/repos/o/r/issues?labels=uptime&state=open&per_page=20");
  });

  it("creates the label (an existing one is fine) and opens the issue", async () => {
    const { gh, calls } = fakeGh({ "POST /repos/o/r/labels": { status: 422, data: {} }, "POST /repos/o/r/issues": { status: 201, data: { html_url: "https://i/9" } } });
    await applyIssueAction(gh, "o/r", { kind: "open", title: ISSUE_TITLE, body: "B" });
    expect(calls.map((c) => `${c[0]} ${c[1]}`)).toEqual(["POST /repos/o/r/labels", "POST /repos/o/r/issues"]);
    expect(calls[1][2]).toEqual({ title: ISSUE_TITLE, body: "B", labels: ["uptime"] });
  });

  it("updates the body and comments only when asked", async () => {
    const { gh, calls } = fakeGh();
    await applyIssueAction(gh, "o/r", { kind: "update", number: 7, body: "B" });
    expect(calls).toEqual([["PATCH", "/repos/o/r/issues/7", { body: "B" }]]);
    const second = fakeGh();
    await applyIssueAction(second.gh, "o/r", { kind: "update", number: 7, body: "B", comment: "C" });
    expect(second.calls.map((c) => c[0])).toEqual(["POST", "PATCH"]);
  });

  it("comments, then closes as completed", async () => {
    const { gh, calls } = fakeGh();
    await applyIssueAction(gh, "o/r", { kind: "close", number: 7, comment: "R" });
    expect(calls).toEqual([
      ["POST", "/repos/o/r/issues/7/comments", { body: "R" }],
      ["PATCH", "/repos/o/r/issues/7", { state: "closed", state_reason: "completed" }],
    ]);
  });

  it("throws on a failed API call so the run turns red", async () => {
    const { gh } = fakeGh({ "POST /repos/o/r/issues": { status: 403, data: { message: "Resource not accessible" } } });
    await expect(applyIssueAction(gh, "o/r", { kind: "open", title: "t", body: "b" })).rejects.toThrow(/403/);
  });

  it("githubClient sends the token and JSON", async () => {
    const f = vi.fn(async () => Response.json({ ok: 1 }, { status: 201 })) as unknown as typeof fetch;
    const res = await githubClient(f, "tok")("POST", "/repos/o/r/issues", { a: 1 });
    expect(res).toEqual({ status: 201, data: { ok: 1 } });
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/o/r/issues");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(init.body).toBe('{"a":1}');
  });
});

describe("summaryMarkdown", () => {
  it("lists every check with its state and the issue outcome", () => {
    const md = summaryMarkdown([{ id: "home", ok: true, detail: "HTTP 200 with og tags" }, { id: "ask", ok: false, detail: "HTTP 502" }], "Opened https://i/9.");
    expect(md).toContain("| Page / | pass | HTTP 200 with og tags |");
    expect(md).toContain("| GET /api/ask status | FAIL | HTTP 502 |");
    expect(md).toContain("Opened https://i/9.");
  });
});

describe("uptime.yml", () => {
  const yml = readFileSync(".github/workflows/uptime.yml", "utf8");
  it("runs hourly (owner decision) and on dispatch with force_fail", () => {
    expect(yml).toMatch(/cron: "17 \* \* \* \*"/);
    expect(yml).toMatch(/workflow_dispatch:\s*\n\s*inputs:\s*\n\s*force_fail:/);
    expect(yml).toContain("UPTIME_FORCE_FAIL: ${{ inputs.force_fail && 'true' || 'false' }}");
  });
  it("uses only issues write, contents read and actions read, and no secrets", () => {
    const job = yml.slice(yml.indexOf("jobs:"));
    expect(job).toMatch(/permissions:\s*\n\s*actions: read\s*\n\s*contents: read\s*\n\s*issues: write/);
    expect(yml).not.toMatch(/secrets\./);
  });
  it("runs the script without installing dependencies", () => {
    expect(yml).toContain("run: bun scripts/uptime.ts");
    expect(yml).not.toContain("bun install");
  });
});
