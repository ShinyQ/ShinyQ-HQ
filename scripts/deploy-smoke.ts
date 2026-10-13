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
import troikaFonts from "../src/experience/troika-fonts.json";
import cvPages from "../content/generated/cv-pages.json";

/** Cache rules from public/_headers that production must serve (round 5 P1). */
export const CACHE_RULES: readonly { prefix: string; value: string }[] = [
  { prefix: "/fonts/3d/", value: "public, max-age=31536000, immutable" },
  { prefix: "/tech/", value: "public, max-age=604800, stale-while-revalidate=86400" },
  { prefix: "/media/", value: "public, max-age=86400, stale-while-revalidate=604800" },
  { prefix: "/floors/", value: "public, max-age=86400, stale-while-revalidate=604800" },
  { prefix: "/cv/pages/", value: "public, max-age=3600, must-revalidate" },
];

export function cacheProblems(observed: Record<string, string | null>): string[] {
  const problems: string[] = [];
  for (const [url, value] of Object.entries(observed)) {
    const rule = CACHE_RULES.find((r) => url.startsWith(r.prefix));
    if (rule && value !== rule.value) problems.push(`${url} Cache-Control is ${value ?? "missing"}, expected ${rule.value}`);
  }
  return problems;
}

/** One file per cached prefix, read from the checkout that was deployed. */
export function cacheSamples(root = process.cwd()): string[] {
  const content = JSON.parse(readFileSync(path.join(root, "content", "site-content.json"), "utf8")) as { floors: { labs: { pods: { assets: { src: string }[] }[] } } };
  const cover = content.floors.labs.pods.find((p) => p.assets.length > 0)!.assets[0].src;
  return [troikaFonts.sans, "/tech/docker.svg", cover, "/floors/L1.webp", cvPages.pages[0].src];
}

export interface Expected {
  asOf: string;
  contributions?: string;
  beacon: boolean;
}

export interface Observed {
  status?: { code: number; enabled?: boolean; asOf?: string };
  page?: { code: number; html: string };
  cache?: Record<string, string | null>;
  /** `GET /api/rum`: the beacon Function only accepts POST, so 405 proves it is deployed. */
  rum?: { code: number };
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
  if (observed.cache) problems.push(...cacheProblems(observed.cache));
  if (observed.rum?.code !== 405) problems.push(`GET /api/rum returned HTTP ${observed.rum?.code ?? "none"}, expected 405 (the performance beacon Function is missing)`);
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
  observed.cache = {};
  for (const sample of cacheSamples()) {
    try {
      const r = await fetch(`${site}${sample}`, { method: "HEAD", cache: "no-store" });
      observed.cache[sample] = r.ok ? r.headers.get("cache-control") : `HTTP ${r.status}`;
    } catch {
      observed.cache[sample] = null;
    }
  }
  try {
    const r = await fetch(`${site}/api/rum`, { cache: "no-store" });
    observed.rum = { code: r.status };
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
  console.log(`Expecting ${site}: Ask enabled as of ${expected.asOf}, ${expected.contributions ?? "no"} contributions, beacon ${expected.beacon ? "on" : "off"}, /api/rum deployed.`);
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
