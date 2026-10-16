/**
 * Post-deploy smoke check for production (deploy.yml), also handy by hand:
 *
 *   bun scripts/deploy-smoke.ts [--site https://kurniadi.pages.dev] [--timeout 180]
 *
 * Expected values come from the checkout that was just deployed: the knowledge pack date
 * (functions/_generated/knowledge.json, so run scripts/build-knowledge.ts first), the live GitHub
 * contributions (content/generated/dynamic-facts.json) and, when NEXT_PUBLIC_CF_BEACON_TOKEN is set,
 * the Web Analytics beacon. /en must also carry its per-page script policy (scripts/csp-hashes.ts) and no
 * Cloudflare-injected beacon (scripts/injected-analytics.ts).
 * Polls until everything matches or the timeout passes, because the production alias can take a
 * moment to switch to the new deployment.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { DynamicFactsSchema } from "@/content/dynamic-facts";
import troikaFonts from "../src/experience/troika-fonts.json";
import cvPages from "../content/generated/cv-pages.json";
import { parseStatsSnapshot } from "../src/lib/stats/protocol";
import { scriptPolicyProblems } from "./csp-hashes";
import { injectedAnalytics } from "./injected-analytics";
import { LINKEDIN_UA, lateShareTags, parseSocialMeta } from "./og-meta";

/** Entry points a visitor pastes into LinkedIn (Featured, posts): each must answer LinkedInBot with a full card. */
export const UNFURL_PATHS = ["/", "/en", "/id"] as const;

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
  /** `GET /api/visit`: the visit beacon Function only accepts POST, so 405 proves it is deployed. */
  visit?: { code: number };
  /** `GET /api/stats`: 204 (no snapshot yet, or switched off) or 200 with a valid snapshot. */
  stats?: { code: number; valid?: boolean };
  /** Each UNFURL_PATHS entry fetched as LinkedInBot without following redirects, and its og:image. */
  unfurl?: Record<string, { code: number; html: string; image?: { code: number; type: string | null } }>;
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
    const injected = injectedAnalytics(p.html);
    if (injected) problems.push(`/en carries ${injected}`);
    // No site policy to compare with: Cloudflare may inject external scripts into production HTML.
    for (const problem of scriptPolicyProblems(p.html)) problems.push(`/en: ${problem}`);
  }
  if (observed.cache) problems.push(...cacheProblems(observed.cache));
  if (observed.rum?.code !== 405) problems.push(`GET /api/rum returned HTTP ${observed.rum?.code ?? "none"}, expected 405 (the performance beacon Function is missing)`);
  if (observed.visit?.code !== 405) problems.push(`GET /api/visit returned HTTP ${observed.visit?.code ?? "none"}, expected 405 (the visit beacon Function is missing)`);
  const st = observed.stats;
  if (st?.code === 200 ? !st.valid : st?.code !== 204) problems.push(st?.code === 200 ? "GET /api/stats served a snapshot that fails the contract" : `GET /api/stats returned HTTP ${st?.code ?? "none"}, expected 200 or 204 (the stats Function is missing)`);
  for (const route of UNFURL_PATHS) {
    const u = observed.unfurl?.[route];
    if (!u || u.code !== 200) {
      problems.push(`LinkedInBot got HTTP ${u?.code ?? "none"} for ${route}, expected 200`);
      continue;
    }
    for (const late of lateShareTags(u.html)) problems.push(`LinkedInBot ${route}: ${late}`);
    const meta = parseSocialMeta(u.html);
    if (meta.og["og:url"] !== meta.canonical) problems.push(`LinkedInBot ${route}: og:url differs from the canonical`);
    if (u.image?.code !== 200 || !u.image.type?.startsWith("image/jpeg")) problems.push(`LinkedInBot ${route}: og:image returned HTTP ${u.image?.code ?? "none"} ${u.image?.type ?? ""}`.trim());
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
  try {
    const r = await fetch(`${site}/api/visit`, { cache: "no-store" });
    observed.visit = { code: r.status };
  } catch {
    // Reported as no response.
  }
  try {
    const r = await fetch(`${site}/api/stats`, { cache: "no-store" });
    let valid = false;
    if (r.status === 200) {
      try {
        valid = parseStatsSnapshot(await r.json()) !== null;
      } catch {
        valid = false;
      }
    }
    observed.stats = { code: r.status, valid };
  } catch {
    // Reported as no response.
  }
  observed.unfurl = {};
  for (const route of UNFURL_PATHS) {
    try {
      const headers = { "user-agent": LINKEDIN_UA, accept: "*/*" };
      const r = await fetch(`${site}${route}`, { headers, redirect: "manual", cache: "no-store" });
      const html = await r.text();
      const entry: NonNullable<Observed["unfurl"]>[string] = { code: r.status, html };
      const image = parseSocialMeta(html).og["og:image"];
      if (image) {
        const i = await fetch(image, { method: "HEAD", headers, cache: "no-store" });
        entry.image = { code: i.status, type: i.headers.get("content-type") };
      }
      observed.unfurl[route] = entry;
    } catch {
      // Reported as no response.
    }
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
  console.log(`Expecting ${site}: Ask enabled as of ${expected.asOf}, ${expected.contributions ?? "no"} contributions, beacon ${expected.beacon ? "on" : "off"}, /api/rum, /api/visit and /api/stats deployed, LinkedInBot cards on ${UNFURL_PATHS.join(", ")}.`);
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
