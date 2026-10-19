/**
 * Ask the HQ knowledge pack in Workers KV (spec 2026-10-19 section 4.5, runbook section 17). Fetch only, over the KV
 * REST API; the namespace is the ASK_KV id in wrangler.toml.
 *
 *   bun scripts/ask-pack.ts publish --commit <sha>         # upload functions/_generated/pack.json (no flip)
 *   bun scripts/ask-pack.ts flip <version>                 # point pack:current at a published, re-validated version
 *   bun scripts/ask-pack.ts pin <version>                  # the same, by hand (owner path)
 *   bun scripts/ask-pack.ts rollback --commit <sha> [--dry-run true]  # flip to the pack deployed with that commit
 *   bun scripts/ask-pack.ts status                         # pointer, index and stored versions
 *   bun scripts/ask-pack.ts verify                         # prove the token can read, list, write and delete pack: keys
 *   bun scripts/ask-pack.ts publish --commit <sha> --dry-run true   # validate and plan, write only the probe key
 *
 * Env: CLOUDFLARE_API_TOKEN (needs Workers KV Storage: Edit) and CLOUDFLARE_ACCOUNT_ID. Any failed KV call (non-2xx other
 * than a 404 read or delete), a failed check or a bad argument exits 1, so a workflow step goes red. `publish` and `flip` write
 * `previous=<version>` and `version=<version>` to $GITHUB_OUTPUT. Keys: `pack:v1:<version>` (immutable value),
 * `pack:current` (pointer), `pack:index` (the last PACK_KEEP versions, newest first), `pack:commit:<sha>` (400 days).
 * Pack content is never published from here without a deploy: `publish` only uploads what this commit built, and
 * `flip` only moves the pointer to a version `publish` already validated and listed.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { packMeta, validateStoredPack, type PackMeta } from "@/ask/pack";
import { loadBlocklist } from "@/content/safety";
import { PACK_SCHEMA } from "../functions/_lib/pack-index";
import { packKey, parsePointer, POINTER_KEY, type PackPointer } from "../functions/_lib/pack-source";
import { readKvId } from "./provision-ask";

export const INDEX_KEY = "pack:index";
export const commitKey = (sha: string) => `pack:commit:${sha}`;
/** Versions kept in KV (older ones are deleted on publish, never the current or the new one). */
export const PACK_KEEP = 10;
/** Lifetime of `pack:commit:<sha>` (400 days): how far back a Pages rollback can find its pack. */
export const COMMIT_TTL_SECONDS = 34_560_000;
/** Written and deleted by `verify` and dry runs (60 s TTL, KV's minimum, in case the delete never runs). */
export const PROBE_KEY = "pack:probe";
export const TOKEN_HINT = "add Workers KV Storage: Edit to CLOUDFLARE_API_TOKEN (docs/ask-runbook.md section 17)";

export interface IndexEntry {
  version: string;
  sha256: string;
  bytes: number;
  packDate: string;
  commit: string;
  publishedAt: string;
}

export interface KvClient {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** KV REST API client. A 401 or 403 names the missing token permission. */
export function kvClient(fetchImpl: typeof fetch, account: string, namespace: string, token: string): KvClient {
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}`;
  const headers = { Authorization: `Bearer ${token}` };
  const check = async (response: Response, what: string) => {
    if (response.status === 401 || response.status === 403) throw new Error(`Cloudflare KV ${what}: HTTP ${response.status}; ${TOKEN_HINT}`);
    if (!response.ok) throw new Error(`Cloudflare KV ${what}: HTTP ${response.status} ${(await response.text().catch(() => "")).slice(0, 300)}`);
  };
  const valueUrl = (key: string) => `${base}/values/${encodeURIComponent(key)}`;
  return {
    async get(key) {
      const response = await fetchImpl(valueUrl(key), { headers });
      if (response.status === 404) return null;
      await check(response, `GET ${key}`);
      return response.text();
    },
    async put(key, value, options = {}) {
      const query = options.expirationTtl ? `?expiration_ttl=${options.expirationTtl}` : "";
      const response = await fetchImpl(`${valueUrl(key)}${query}`, { method: "PUT", headers: { ...headers, "Content-Type": "application/octet-stream" }, body: value });
      await check(response, `PUT ${key}`);
    },
    async delete(key) {
      const response = await fetchImpl(valueUrl(key), { method: "DELETE", headers });
      if (response.status === 404) return;
      await check(response, `DELETE ${key}`);
    },
    async list(prefix) {
      const names: string[] = [];
      let cursor = "";
      do {
        const response = await fetchImpl(`${base}/keys?prefix=${encodeURIComponent(prefix)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { headers });
        await check(response, `list ${prefix}`);
        const json = (await response.json()) as { result?: { name: string }[]; result_info?: { cursor?: string } };
        names.push(...(json.result ?? []).map((k) => k.name));
        cursor = json.result_info?.cursor ?? "";
      } while (cursor);
      return names;
    },
  };
}

export function parseIndex(raw: string | null): IndexEntry[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((e): e is IndexEntry => Boolean(e) && typeof e.version === "string" && typeof e.sha256 === "string") : [];
  } catch {
    return [];
  }
}

/** The index after publishing `meta` from `commit`: the version moves to the front (newest first), with its latest commit. */
export function planPublish(index: readonly IndexEntry[], meta: PackMeta, commit: string, now: Date): IndexEntry[] {
  const entry: IndexEntry = { version: meta.version, sha256: meta.sha256, bytes: meta.bytes, packDate: meta.packDate, commit, publishedAt: now.toISOString() };
  return [entry, ...index.filter((e) => e.version !== meta.version)];
}

/** Keeps the newest `keep` entries plus every protected version (the current pointer, the new one); the rest are pruned. */
export function planPrune(index: readonly IndexEntry[], protect: readonly string[], keep = PACK_KEEP): { kept: IndexEntry[]; pruned: IndexEntry[] } {
  const kept: IndexEntry[] = [];
  const pruned: IndexEntry[] = [];
  for (const entry of index) (kept.length < keep || protect.includes(entry.version) ? kept : pruned).push(entry);
  return { kept, pruned };
}

export interface Deps {
  kv: KvClient;
  blocklist: readonly string[];
  now?: () => Date;
  log?: (line: string) => void;
}

export interface PublishInput {
  json: string;
  meta: PackMeta;
  commit: string;
}

/** Uploads this build's pack (not flipped). Fails before any write when the value or its pin do not validate. */
export async function publish({ kv, blocklist, now = () => new Date(), log = console.log }: Deps, { json, meta, commit }: PublishInput, options: { dryRun?: boolean } = {}): Promise<{ previous: string; version: string; uploaded: boolean; pruned: string[] }> {
  if (!/^[0-9a-f]{7,40}$/.test(commit)) throw new Error(`publish needs --commit <sha>, got "${commit}"`);
  const errors = validateStoredPack(json, blocklist);
  if (errors.length) throw new Error(`the built pack does not validate:\n- ${errors.join("\n- ")}`);
  const actual = packMeta(json);
  if (JSON.stringify(actual) !== JSON.stringify(meta)) throw new Error(`pack-meta.json does not match pack.json (${JSON.stringify(meta)} vs ${JSON.stringify(actual)})`);
  if (meta.schema !== PACK_SCHEMA) throw new Error(`pack schema ${meta.schema} is not ${PACK_SCHEMA}`);

  const previous = parsePointer(await kv.get(POINTER_KEY))?.version ?? "";
  const existing = await kv.get(packKey(meta.version));
  if (existing !== null && sha256(existing) !== meta.sha256) throw new Error(`${packKey(meta.version)} already exists with another SHA-256; a version is immutable (bump the content or PACK_SCHEMA)`);
  if (options.dryRun) {
    const { kept, pruned } = planPrune(planPublish(parseIndex(await kv.get(INDEX_KEY)), meta, commit, now()), [meta.version, previous].filter(Boolean));
    await probe(kv);
    log(
      `Dry run for ${commit.slice(0, 7)}: would ${existing === null ? `upload ${packKey(meta.version)} (${meta.bytes} bytes)` : `keep ${packKey(meta.version)} (same SHA-256)`}, write ${commitKey(commit)} and ${INDEX_KEY} (${kept.length} versions)${pruned.length ? `, delete ${pruned.map((e) => packKey(e.version)).join(", ")}` : ""}; current pointer ${previous || "(none)"}. The probe write succeeded.`,
    );
    return { previous, version: meta.version, uploaded: false, pruned: pruned.map((e) => e.version) };
  }
  let uploaded = false;
  if (existing === null) {
    await kv.put(packKey(meta.version), json);
    uploaded = true;
  }
  await kv.put(commitKey(commit), meta.version, { expirationTtl: COMMIT_TTL_SECONDS });
  const { kept, pruned } = planPrune(planPublish(parseIndex(await kv.get(INDEX_KEY)), meta, commit, now()), [meta.version, previous].filter(Boolean));
  await kv.put(INDEX_KEY, JSON.stringify(kept));
  for (const entry of pruned) await kv.delete(packKey(entry.version));
  log(`Published ${meta.version} (${meta.bytes} bytes, as of ${meta.packDate}) for ${commit.slice(0, 7)}: ${uploaded ? "uploaded" : "already stored, same SHA-256"}; current pointer ${previous || "(none)"}${pruned.length ? `; pruned ${pruned.map((e) => e.version).join(", ")}` : ""}.`);
  return { previous, version: meta.version, uploaded, pruned: pruned.map((e) => e.version) };
}

/** Points `pack:current` at a version from `pack:index` after reading its value back and re-validating it. */
export async function flip({ kv, blocklist, log = console.log }: Deps, version: string): Promise<{ previous: string; version: string }> {
  const entry = parseIndex(await kv.get(INDEX_KEY)).find((e) => e.version === version);
  if (!entry) throw new Error(`${version} is not in ${INDEX_KEY}; only published versions can be served`);
  const value = await kv.get(packKey(version));
  if (value === null) throw new Error(`${packKey(version)} is missing`);
  if (sha256(value) !== entry.sha256) throw new Error(`${packKey(version)} does not match its SHA-256 in ${INDEX_KEY}`);
  const errors = validateStoredPack(value, blocklist);
  if (errors.length) throw new Error(`${packKey(version)} no longer validates:\n- ${errors.join("\n- ")}`);
  const previous = parsePointer(await kv.get(POINTER_KEY))?.version ?? "";
  if (previous === version) {
    log(`${POINTER_KEY} already points at ${version}.`);
    return { previous, version };
  }
  const pointer: PackPointer = { schema: PACK_SCHEMA, version, packDate: entry.packDate, sha256: entry.sha256, bytes: entry.bytes, commit: entry.commit, publishedAt: entry.publishedAt };
  await kv.put(POINTER_KEY, JSON.stringify(pointer));
  log(`${POINTER_KEY}: ${previous || "(none)"} -> ${version} (as of ${entry.packDate}).`);
  return { previous, version };
}

/** After a Pages rollback to `commit`: flip to the pack deployed with it, or leave the pointer with a note. */
export async function rollback(deps: Deps, commit: string, dryRun: boolean): Promise<{ action: "flip" | "dry-run" | "none"; note: string; version?: string }> {
  const log = deps.log ?? console.log;
  const version = await deps.kv.get(commitKey(commit));
  const current = parsePointer(await deps.kv.get(POINTER_KEY))?.version ?? "";
  const done = (result: { action: "flip" | "dry-run" | "none"; note: string; version?: string }) => (log(result.note), result);
  if (!version) return done({ action: "none", note: `No KV pack recorded for ${commit.slice(0, 7)} (it predates KV packs or the key expired); ${POINTER_KEY} stays at ${current || "(none)"}.` });
  if (version === current) return done({ action: "none", note: `${POINTER_KEY} already points at ${version}, the pack of ${commit.slice(0, 7)}.`, version });
  if (!parseIndex(await deps.kv.get(INDEX_KEY)).some((e) => e.version === version)) return done({ action: "none", note: `The pack of ${commit.slice(0, 7)} (${version}) was pruned; ${POINTER_KEY} stays at ${current || "(none)"}.`, version });
  if (dryRun) return done({ action: "dry-run", note: `Dry run: would flip ${POINTER_KEY} from ${current || "(none)"} to ${version}, the pack of ${commit.slice(0, 7)}.`, version });
  await flip(deps, version);
  return { action: "flip", note: `Flipped ${POINTER_KEY} from ${current || "(none)"} to ${version}, the pack of ${commit.slice(0, 7)}.`, version };
}

/** Writes, reads back and deletes `PROBE_KEY`: proves the token may write `pack:` keys without touching the pack. */
async function probe(kv: KvClient): Promise<void> {
  const nonce = `probe ${new Date().toISOString()} ${Math.random().toString(36).slice(2)}`;
  await kv.put(PROBE_KEY, nonce, { expirationTtl: 60 });
  await kv.delete(PROBE_KEY);
}

/** The deploy token's KV access, as `deploy.yml` uses it: read the pointer and index, list `pack:` keys, write and delete a probe. */
export async function verify({ kv, log = console.log }: Deps): Promise<void> {
  const pointer = parsePointer(await kv.get(POINTER_KEY));
  const index = parseIndex(await kv.get(INDEX_KEY));
  const keys = await kv.list("pack:");
  await probe(kv);
  log(`KV access OK: read ${POINTER_KEY} (${pointer?.version ?? "none"}) and ${INDEX_KEY} (${index.length} versions), listed ${keys.length} pack: keys, wrote and deleted ${PROBE_KEY}.`);
}

export async function status({ kv, log = console.log }: Deps): Promise<void> {
  const pointer = parsePointer(await kv.get(POINTER_KEY));
  const index = parseIndex(await kv.get(INDEX_KEY));
  const stored = new Set(await kv.list("pack:v"));
  log(`${POINTER_KEY}: ${pointer ? `${pointer.version} (schema ${pointer.schema}, as of ${pointer.packDate}, commit ${(pointer.commit ?? "").slice(0, 7)})` : "(none)"}`);
  log(`${INDEX_KEY} (newest first):`);
  for (const e of index) log(`  ${e.version}  ${e.packDate}  ${e.commit.slice(0, 7)}  ${e.publishedAt}  ${stored.has(packKey(e.version)) ? "stored" : "MISSING"}${e.version === pointer?.version ? "  <- current" : ""}`);
  const orphans = [...stored].filter((k) => !index.some((e) => packKey(e.version) === k));
  if (orphans.length) log(`Stored but not indexed: ${orphans.join(", ")}`);
}

/** The deploy job's blocklist (with the private terms, functions/_generated/safety.json), else the repo's lists. */
function blocklist(root: string, env: Record<string, string | undefined>): string[] {
  const file = path.join(root, "functions", "_generated", "safety.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { blocklist: string[] }).blocklist : loadBlocklist(env);
}

const USAGE = "usage: bun scripts/ask-pack.ts publish --commit <sha> [--dry-run true] | flip <version> | pin <version> | rollback --commit <sha> [--dry-run true] | status | verify";

/** The CLI. Returns the exit code: 0, or 1 on any failed KV call, check or argument (printed as a GitHub error annotation). */
export async function run(argv: readonly string[], options: { env?: Record<string, string | undefined>; fetch?: typeof fetch; root?: string; log?: (line: string) => void } = {}): Promise<number> {
  const env = options.env ?? process.env;
  const root = options.root ?? process.cwd();
  const log = options.log ?? console.log;
  const [command, ...args] = argv;
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  try {
    const token = env.CLOUDFLARE_API_TOKEN;
    const account = env.CLOUDFLARE_ACCOUNT_ID;
    const namespace = readKvId(readFileSync(path.join(root, "wrangler.toml"), "utf8"));
    if (!["publish", "flip", "pin", "rollback", "status", "verify"].includes(command ?? "")) throw new Error(USAGE);
    if (!token || !account) throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");
    if (!namespace) throw new Error("wrangler.toml has no ASK_KV namespace id");
    const deps: Deps = { kv: kvClient(options.fetch ?? fetch, account, namespace, token), blocklist: blocklist(root, env), log };
    const output = (values: Record<string, string>) => {
      if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(""));
    };
    if (command === "publish") {
      const dir = path.join(root, "functions", "_generated");
      const json = readFileSync(path.join(dir, "pack.json"), "utf8");
      const meta = JSON.parse(readFileSync(path.join(dir, "pack-meta.json"), "utf8")) as PackMeta;
      const dryRun = flag("--dry-run") === "true";
      const result = await publish(deps, { json, meta, commit: flag("--commit") ?? "" }, { dryRun });
      if (!dryRun) output({ previous: result.previous, version: result.version });
    } else if (command === "flip" || command === "pin") {
      const version = args[0];
      if (!version || !/^[0-9a-f]{16}$/.test(version)) throw new Error(`usage: bun scripts/ask-pack.ts ${command} <version>`);
      output(await flip(deps, version));
    } else if (command === "rollback") {
      const commit = flag("--commit");
      if (!commit) throw new Error("usage: bun scripts/ask-pack.ts rollback --commit <sha> [--dry-run true]");
      await rollback(deps, commit, flag("--dry-run") === "true");
    } else if (command === "status") {
      await status(deps);
    } else {
      await verify(deps);
    }
    return 0;
  } catch (error) {
    log(`::error::${(error as Error).message.split("\n").join("%0A")}`);
    return 1;
  }
}

if (import.meta.main) process.exit(await run(process.argv.slice(2)));
