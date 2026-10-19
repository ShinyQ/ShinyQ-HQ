import { beforeAll, describe, expect, it } from "vitest";
import { buildPackArtifacts, type PackMeta } from "@/ask/pack";
import { buildRepoPack } from "@/ask/repo-pack";
import { COMMIT_TTL_SECONDS, commitKey, flip, INDEX_KEY, kvClient, PACK_KEEP, parseIndex, planPrune, planPublish, PROBE_KEY, publish, rollback, run, status, TOKEN_HINT, verify, type Deps, type IndexEntry } from "../../scripts/ask-pack";
import { packKey, POINTER_KEY } from "../../functions/_lib/pack-source";

const ACCOUNT = "a".repeat(32);
const NAMESPACE = "n".repeat(32);

/** Fake KV REST API: values, TTLs, request log; `deny` answers 403 like a token without the KV permission. */
function fakeApi() {
  const store = new Map<string, string>();
  const ttl = new Map<string, number>();
  const requests: string[] = [];
  let deny = false;
  let fail: ((method: string, key: string) => number | undefined) | null = null;
  const api = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer token");
    if (deny) return new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }), { status: 403 });
    if (url.pathname.endsWith("/keys")) {
      const prefix = url.searchParams.get("prefix") ?? "";
      requests.push(`LIST ${prefix}`);
      return Response.json({ success: true, result: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), result_info: { cursor: "" } });
    }
    const key = decodeURIComponent(url.pathname.split("/values/")[1]);
    requests.push(`${method} ${key}`);
    const failure = fail?.(method, key);
    if (failure) return new Response("upstream error", { status: failure });
    if (method === "GET") return store.has(key) ? new Response(store.get(key)) : new Response(JSON.stringify({ success: false }), { status: 404 });
    if (method === "PUT") {
      expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/octet-stream");
      store.set(key, String(init?.body));
      const t = url.searchParams.get("expiration_ttl");
      if (t) ttl.set(key, Number(t));
      return Response.json({ success: true });
    }
    if (method === "DELETE") {
      store.delete(key);
      return Response.json({ success: true });
    }
    return new Response(null, { status: 405 });
  }) as typeof fetch;
  return { api, store, ttl, requests, setDeny: (v: boolean) => (deny = v), setFail: (f: typeof fail) => (fail = f) };
}

let blocklist: string[];
let json: string;
let meta: PackMeta;
let json2: string;
let meta2: PackMeta;

beforeAll(() => {
  const a = buildRepoPack("2026-10-11");
  blocklist = a.safety.blocklist;
  ({ json, meta } = buildPackArtifacts(a.pack, blocklist));
  const b = buildRepoPack("2026-12-01");
  ({ json: json2, meta: meta2 } = buildPackArtifacts(b.pack, blocklist));
});

function setup() {
  const fake = fakeApi();
  const lines: string[] = [];
  const deps: Deps = { kv: kvClient(fake.api, ACCOUNT, NAMESPACE, "token"), blocklist, now: () => new Date("2026-10-19T00:00:00Z"), log: (l) => void lines.push(l) };
  return { ...fake, deps, lines };
}

const entry = (version: string, commit = "c".repeat(40)): IndexEntry => ({ version, sha256: "0".repeat(64), bytes: 1, packDate: "2026-10-19", commit, publishedAt: "2026-10-19T00:00:00.000Z" });

describe("ask-pack planning", () => {
  it("puts the published version first and drops its older entry", () => {
    const index = [entry("b".repeat(16)), entry(meta.version, "d".repeat(40))];
    const next = planPublish(index, meta, "e".repeat(40), new Date("2026-10-19T01:00:00Z"));
    expect(next.map((e) => e.version)).toEqual([meta.version, "b".repeat(16)]);
    expect(next[0]).toMatchObject({ commit: "e".repeat(40), sha256: meta.sha256, publishedAt: "2026-10-19T01:00:00.000Z" });
  });

  it("prunes beyond PACK_KEEP but never a protected version", () => {
    const index = Array.from({ length: 13 }, (_, i) => entry(i.toString(16).padStart(16, "0")));
    const current = index[12].version;
    const { kept, pruned } = planPrune(index, [current]);
    expect(PACK_KEEP).toBe(10);
    expect(kept.map((e) => e.version)).toEqual([...index.slice(0, 10), index[12]].map((e) => e.version));
    expect(pruned.map((e) => e.version)).toEqual([index[10].version, index[11].version]);
  });

  it("ignores a malformed index", () => {
    expect(parseIndex("{x")).toEqual([]);
    expect(parseIndex('[{"version":1},null]')).toEqual([]);
  });
});

describe("ask-pack publish", () => {
  it("uploads the value, records the commit for 400 days and lists the version, without flipping", async () => {
    const { deps, store, ttl, requests } = setup();
    const result = await publish(deps, { json, meta, commit: "a1".repeat(20) });
    expect(result).toEqual({ previous: "", version: meta.version, uploaded: true, pruned: [] });
    expect(store.get(packKey(meta.version))).toBe(json);
    expect(store.get(commitKey("a1".repeat(20)))).toBe(meta.version);
    expect(ttl.get(commitKey("a1".repeat(20)))).toBe(COMMIT_TTL_SECONDS);
    expect(ttl.has(packKey(meta.version))).toBe(false);
    expect(parseIndex(store.get(INDEX_KEY) ?? null).map((e) => e.version)).toEqual([meta.version]);
    expect(store.has(POINTER_KEY)).toBe(false);
    expect(requests.filter((r) => r.startsWith("PUT"))).toHaveLength(3);
  });

  it("is idempotent for the same bytes and fails for another value under the same version", async () => {
    const { deps, store, requests } = setup();
    await publish(deps, { json, meta, commit: "a1".repeat(20) });
    requests.length = 0;
    expect((await publish(deps, { json, meta, commit: "b2".repeat(20) })).uploaded).toBe(false);
    expect(requests).not.toContain(`PUT ${packKey(meta.version)}`);
    store.set(packKey(meta.version), `${json} `);
    await expect(publish(deps, { json, meta, commit: "c3".repeat(20) })).rejects.toThrow(/another SHA-256/);
  });

  it("refuses an invalid pack or a pin that does not match, before any write", async () => {
    const { deps, requests } = setup();
    await expect(publish(deps, { json, meta: { ...meta, sha256: "f".repeat(64) }, commit: "a1".repeat(20) })).rejects.toThrow(/does not match/);
    await expect(publish(deps, { json: json.replace('"contact"', '"contactx"'), meta, commit: "a1".repeat(20) })).rejects.toThrow(/does not validate/);
    await expect(publish(deps, { json, meta, commit: "" })).rejects.toThrow(/--commit/);
    expect(requests).toEqual([]);
  });

  it("prunes the oldest versions but keeps the current pointer", async () => {
    const { deps, store } = setup();
    const old = Array.from({ length: 11 }, (_, i) => entry(i.toString(16).padStart(16, "0")));
    for (const e of old) store.set(packKey(e.version), "x");
    store.set(INDEX_KEY, JSON.stringify(old));
    store.set(POINTER_KEY, JSON.stringify({ schema: 1, version: old[10].version, packDate: "2026-10-19", sha256: "0".repeat(64), bytes: 1 }));
    const result = await publish(deps, { json, meta, commit: "a1".repeat(20) });
    expect(result.previous).toBe(old[10].version);
    expect(result.pruned).toEqual([old[9].version]);
    expect(store.has(packKey(old[9].version))).toBe(false);
    expect(store.has(packKey(old[10].version))).toBe(true);
    expect(parseIndex(store.get(INDEX_KEY) ?? null)).toHaveLength(11);
  });

  it("names the missing token permission on a 403", async () => {
    const { deps, setDeny } = setup();
    setDeny(true);
    await expect(publish(deps, { json, meta, commit: "a1".repeat(20) })).rejects.toThrow(TOKEN_HINT);
    expect(TOKEN_HINT).toContain("add Workers KV Storage: Edit to CLOUDFLARE_API_TOKEN");
  });
});

describe("ask-pack flip and rollback", () => {
  it("flips only to a listed version whose stored value re-validates", async () => {
    const { deps, store } = setup();
    await expect(flip(deps, meta.version)).rejects.toThrow(/not in pack:index/);
    await publish(deps, { json, meta, commit: "a1".repeat(20) });
    const result = await flip(deps, meta.version);
    expect(result).toEqual({ previous: "", version: meta.version });
    expect(JSON.parse(store.get(POINTER_KEY) ?? "{}")).toMatchObject({ schema: 1, version: meta.version, sha256: meta.sha256, bytes: meta.bytes, packDate: meta.packDate, commit: "a1".repeat(20) });
    store.set(packKey(meta.version), json.replace("Metrodata", "Metrodatb"));
    await expect(flip(deps, meta.version)).rejects.toThrow(/does not match its SHA-256/);
    store.delete(packKey(meta.version));
    await expect(flip(deps, meta.version)).rejects.toThrow(/missing/);
  });

  it("rolls back to the pack deployed with a commit, or leaves the pointer with a note", async () => {
    const { deps, store } = setup();
    await publish(deps, { json, meta, commit: "a1".repeat(20) });
    await flip(deps, meta.version);
    await publish(deps, { json: json2, meta: meta2, commit: "b2".repeat(20) });
    await flip(deps, meta2.version);

    expect((await rollback(deps, "a1".repeat(20), true)).action).toBe("dry-run");
    expect(JSON.parse(store.get(POINTER_KEY) ?? "{}").version).toBe(meta2.version);
    expect(await rollback(deps, "a1".repeat(20), false)).toMatchObject({ action: "flip", version: meta.version });
    expect(JSON.parse(store.get(POINTER_KEY) ?? "{}").version).toBe(meta.version);
    expect((await rollback(deps, "a1".repeat(20), false)).action).toBe("none");
    expect((await rollback(deps, "f".repeat(40), false)).note).toMatch(/predates KV packs/);
    store.set(INDEX_KEY, JSON.stringify(parseIndex(store.get(INDEX_KEY) ?? null).filter((e) => e.version !== meta2.version)));
    expect((await rollback(deps, "b2".repeat(20), false)).note).toMatch(/was pruned/);
  });

  it("reports the pointer, the index and missing values", async () => {
    const { deps, lines, store } = setup();
    await publish(deps, { json, meta, commit: "a1".repeat(20) });
    await flip(deps, meta.version);
    store.set(packKey("e".repeat(16)), "orphan");
    await status(deps);
    expect(lines.join("\n")).toContain(`${meta.version}  ${meta.packDate}  a1a1a1a`);
    expect(lines.join("\n")).toContain("<- current");
    expect(lines.join("\n")).toContain(`Stored but not indexed: ${packKey("e".repeat(16))}`);
  });
});

describe("ask-pack verify, dry run and exit codes", () => {
  it("verifies read, list, write and delete with a probe key only", async () => {
    const { deps, requests, store, ttl, lines } = setup();
    await verify(deps);
    expect(requests).toEqual([`GET ${POINTER_KEY}`, `GET ${INDEX_KEY}`, "LIST pack:", `PUT ${PROBE_KEY}`, `DELETE ${PROBE_KEY}`]);
    expect(ttl.get(PROBE_KEY)).toBe(60);
    expect(store.size).toBe(0);
    expect(lines.join("\n")).toContain("KV access OK");
  });

  it("dry-runs a publish: validates and plans, writes only the probe", async () => {
    const { deps, requests, store, lines } = setup();
    const result = await publish(deps, { json, meta, commit: "a1".repeat(20) }, { dryRun: true });
    expect(result).toMatchObject({ version: meta.version, uploaded: false });
    expect(requests.filter((r) => /^(PUT|DELETE)/.test(r))).toEqual([`PUT ${PROBE_KEY}`, `DELETE ${PROBE_KEY}`]);
    expect(store.size).toBe(0);
    expect(lines.join("\n")).toMatch(/Dry run .*would upload pack:v1:/);
    store.set(packKey(meta.version), `${json} `);
    await expect(publish(deps, { json, meta, commit: "a1".repeat(20) }, { dryRun: true })).rejects.toThrow(/another SHA-256/);
  });

  it("fails publish on a KV write error before the pointer can move", async () => {
    const { deps, setFail, store } = setup();
    setFail((method, key) => (method === "PUT" && key === INDEX_KEY ? 500 : undefined));
    await expect(publish(deps, { json, meta, commit: "a1".repeat(20) })).rejects.toThrow(/HTTP 500/);
    expect(store.has(POINTER_KEY)).toBe(false);
  });

  const cli = async (argv: string[], fail?: (method: string, key: string) => number | undefined, deny = false, env: Record<string, string> = { CLOUDFLARE_API_TOKEN: "token", CLOUDFLARE_ACCOUNT_ID: ACCOUNT }) => {
    const fake = fakeApi();
    if (fail) fake.setFail(fail);
    fake.setDeny(deny);
    const lines: string[] = [];
    // The namespace comes from the repo's wrangler.toml; route every call to the fake API whatever its id.
    const api = ((input: string | URL | Request, init?: RequestInit) => fake.api(String(input).replace(/namespaces\/[^/]+/, `namespaces/${NAMESPACE}`), init)) as typeof fetch;
    const code = await run(argv, { env, fetch: api, log: (l) => void lines.push(l) });
    return { code, lines: lines.join("\n"), fake };
  };

  it("exits 0 when every call succeeds and 1 on any non-2xx write, a denied token, a bad argument or missing secrets", async () => {
    expect((await cli(["verify"])).code).toBe(0);
    const put = await cli(["verify"], (method) => (method === "PUT" ? 500 : undefined));
    expect(put.code).toBe(1);
    expect(put.lines).toMatch(/::error::Cloudflare KV PUT pack:probe: HTTP 500/);
    expect((await cli(["verify"], (method) => (method === "DELETE" ? 502 : undefined))).code).toBe(1);
    expect((await cli(["verify"], (method, key) => (method === "GET" && key === POINTER_KEY ? 503 : undefined))).code).toBe(1);
    const denied = await cli(["verify"], undefined, true);
    expect(denied.code).toBe(1);
    expect(denied.lines).toContain(TOKEN_HINT);
    expect((await cli(["flip", "not-a-version"])).code).toBe(1);
    expect((await cli(["nope"])).code).toBe(1);
    expect((await cli(["verify"], undefined, false, {})).lines).toMatch(/CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required/);
  });

  it("fails a flip when the pointer write fails, and exits 1 for an unpublished version", async () => {
    const { deps, setFail, store } = setup();
    await publish(deps, { json, meta, commit: "a1".repeat(20) });
    setFail((method, key) => (method === "PUT" && key === POINTER_KEY ? 500 : undefined));
    await expect(flip(deps, meta.version)).rejects.toThrow(/PUT pack:current: HTTP 500/);
    expect(store.has(POINTER_KEY)).toBe(false);
    const { code, lines } = await cli(["flip", meta.version]);
    expect(code).toBe(1);
    expect(lines).toMatch(/not in pack:index/);
  });
});
