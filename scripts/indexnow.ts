#!/usr/bin/env bun
/**
 * IndexNow ping after a production deploy (deploy.yml, after the smoke check): tells Bing and the other IndexNow
 * engines (not Google) which URLs changed, so new and revised pages are recrawled within days.
 *
 *   bun scripts/indexnow.ts --site https://shinyq.my.id --previous previous-sitemap.xml [--current out/sitemap.xml] [--dir out] [--dry-run]
 *
 * Changed URLs: entries of the new sitemap that the previous one (production's, fetched before the upload) lacks or
 * dates differently, plus entries it dropped (a dropped page answers with its canonical or a 404, which the engines
 * should see too). Without a previous sitemap it pings nothing. The key is public by design: the one file
 * `{key}.txt` at the export root (from public/, 32 hex characters, containing the key), found by its name; the ping
 * goes out only once production serves that file. Never fails a deploy: the workflow step continues on error.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** The protocol's limit per POST. */
const BATCH = 10_000;
const KEY_FILE = /^([0-9a-f]{32})\.txt$/;

/** `<loc>` to `<lastmod>` ("" when undated) of every `<url>` of a sitemap. */
export function sitemapEntries(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, body] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(body)?.[1];
    if (loc) out.set(loc.replace(/&amp;/g, "&"), /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(body)?.[1] ?? "");
  }
  return out;
}

/** New, re-dated and dropped URLs on `host`, sorted. */
export function changedUrls(previous: Map<string, string>, current: Map<string, string>, host: string): string[] {
  const changed = new Set<string>();
  for (const [url, lastmod] of current) if (previous.get(url) !== lastmod) changed.add(url);
  for (const url of previous.keys()) if (!current.has(url)) changed.add(url);
  return [...changed].filter((url) => new URL(url).host === host).sort();
}

/** The IndexNow key: the name of the single `{32 hex}.txt` file in `dir` whose content is that name. */
export function findKey(dir: string): string | undefined {
  const keys = readdirSync(dir)
    .map((name) => KEY_FILE.exec(name)?.[1])
    .filter((key): key is string => Boolean(key) && readFileSync(path.join(dir, `${key}.txt`), "utf8").trim() === key);
  return keys.length === 1 ? keys[0] : undefined;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name: string, fallback?: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const site = new URL(flag("--site", process.env.NEXT_PUBLIC_SITE_URL ?? "")!);
  const previousFile = flag("--previous");
  const currentFile = flag("--current", path.join("out", "sitemap.xml"))!;
  const dir = flag("--dir", "out")!;
  const dryRun = args.includes("--dry-run");

  const key = findKey(dir);
  if (!key) {
    console.error(`indexnow: no single {key}.txt IndexNow key file in ${dir}/`);
    process.exit(1);
  }
  if (!previousFile || !existsSync(previousFile) || !readFileSync(previousFile, "utf8").includes("<urlset")) {
    console.warn("indexnow: no previous sitemap from production, so nothing to compare; no ping");
    process.exit(0);
  }
  const urls = changedUrls(sitemapEntries(readFileSync(previousFile, "utf8")), sitemapEntries(readFileSync(currentFile, "utf8")), site.host);
  console.log(`indexnow: ${urls.length} changed URL(s) on ${site.host}`);
  for (const url of urls.slice(0, 20)) console.log(`  ${url}`);
  if (urls.length > 20) console.log(`  ... and ${urls.length - 20} more`);
  if (urls.length === 0 || dryRun) process.exit(0);

  const keyLocation = new URL(`/${key}.txt`, site).href;
  const served = await fetch(keyLocation, { redirect: "manual" }).catch(() => undefined);
  if (served?.status !== 200 || (await served.text()).trim() !== key) {
    console.error(`indexnow: ${keyLocation} does not serve the key (HTTP ${served?.status ?? "none"}); no ping`);
    process.exit(1);
  }
  let failed = false;
  for (let i = 0; i < urls.length; i += BATCH) {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: site.host, key, keyLocation, urlList: urls.slice(i, i + BATCH) }),
    }).catch((error: unknown) => ({ ok: false, status: 0, text: async () => String(error) }));
    // 200 OK and 202 Accepted (key validation pending) both mean received.
    console.log(`indexnow: POST ${urls.slice(i, i + BATCH).length} URL(s), HTTP ${response.status}`);
    if (!response.ok) {
      failed = true;
      console.error(`indexnow: ${(await response.text()).slice(0, 300)}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
