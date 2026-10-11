/**
 * Post-deploy smoke check for production (deploy.yml), also handy by hand:
 *
 *   bun scripts/deploy-smoke.ts [--site https://kurniadi.pages.dev] [--timeout 180]
 *
 * Expected values come from the checkout that was just deployed: the knowledge pack date
 * (functions/_generated/knowledge.json, so run scripts/build-knowledge.ts first), the live GitHub
 * contributions (content/generated/dynamic-facts.json) and, when NEXT_PUBLIC_CF_BEACON_TOKEN is set,
 * the Web Analytics beacon. Polls until everything matches or the timeout passes, because the
 * production alias can take a moment to switch to the new deployment.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { DynamicFactsSchema } from "@/content/dynamic-facts";

export interface Expected {
  asOf: string;
  contributions?: string;
  beacon: boolean;
}

export interface Observed {
  status?: { code: number; enabled?: boolean; asOf?: string };
  page?: { code: number; html: string };
}

/** Problems with what production serves; empty when it matches. */
export function smokeProblems(expected: Expected, observed: Observed): string[] {
  const problems: string[] = [];
  const s = observed.status;
  if (!s || s.code !== 200 || s.enabled !== true) problems.push(`GET /api/ask is not enabled (HTTP ${s?.code ?? "none"})`);
  else if (s.asOf !== expected.asOf) problems.push(`GET /api/ask asOf is ${s.asOf}, expected ${expected.asOf}`);
  const p = observed.page;
  if (!p || p.code !== 200) problems.push(`/en returned HTTP ${p?.code ?? "none"}`);
  else {
    if (expected.contributions && !p.html.includes(expected.contributions)) problems.push(`/en does not show ${expected.contributions} contributions`);
    const hasBeacon = p.html.includes("static.cloudflareinsights.com/beacon.min.js");
    if (expected.beacon && !hasBeacon) problems.push("/en has no Web Analytics beacon");
  }
  return problems;
}

export function expectedFromCheckout(root = process.cwd(), env = process.env): Expected {
  const pack = JSON.parse(readFileSync(path.join(root, "functions", "_generated", "knowledge.json"), "utf8")) as { packDate: string };
  const facts = DynamicFactsSchema.parse(JSON.parse(readFileSync(path.join(root, "content", "generated", "dynamic-facts.json"), "utf8")));
  return {
    asOf: pack.packDate,
    contributions: facts.github?.contributionsLastYear.toLocaleString("en-US"),
    beacon: Boolean(env.NEXT_PUBLIC_CF_BEACON_TOKEN?.trim()),
  };
}

async function observe(site: string): Promise<Observed> {
  const observed: Observed = {};
  try {
    const r = await fetch(`${site}/api/ask`, { cache: "no-store" });
    const body = r.headers.get("content-type")?.includes("json") ? ((await r.json()) as { enabled?: boolean; asOf?: string }) : {};
    observed.status = { code: r.status, enabled: body.enabled, asOf: body.asOf };
  } catch {
    // Reported as "not enabled".
  }
  try {
    const r = await fetch(`${site}/en?smoke=${Date.now()}`, { cache: "no-store" });
    observed.page = { code: r.status, html: await r.text() };
  } catch {
    // Reported as no response.
  }
  return observed;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const site = (flag("--site") ?? process.env.SITE_URL ?? "https://kurniadi.pages.dev").replace(/\/+$/, "");
  const deadline = Date.now() + (Number(flag("--timeout")) || 180) * 1000;
  const expected = expectedFromCheckout();
  console.log(`Expecting ${site}: Ask enabled as of ${expected.asOf}, ${expected.contributions ?? "no"} contributions, beacon ${expected.beacon ? "on" : "off"}.`);
  let problems: string[] = [];
  while (true) {
    problems = smokeProblems(expected, await observe(site));
    if (problems.length === 0 || Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 15_000));
  }
  if (problems.length) {
    console.error(`Smoke check failed:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log("Smoke check passed.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
