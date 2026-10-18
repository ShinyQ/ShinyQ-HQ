import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildFallbackPack, buildPackArtifacts, packMeta } from "@/ask/pack";
import { buildRepoPack } from "@/ask/repo-pack";
import { createPackSource, NEGATIVE_TTL_MS, packKey, parsePointer, POINTER_KEY, POINTER_TTL_MS, SERVED_REQUIRED_CHUNKS, VALUE_CACHE_TTL, type PackPin } from "../../functions/_lib/pack-source";
import { REQUIRED_CHUNKS } from "@/ask/pack";
import type { AskEnv, KnowledgePack, KvNamespace, StoredPack } from "../../functions/_lib/types";

/** In-memory KV that counts reads per key and can be told to fail. */
class CountingKv implements KvNamespace {
  store = new Map<string, string>();
  reads: string[] = [];
  options: { key: string; cacheTtl?: number }[] = [];
  failing = false;
  gate: Promise<void> | null = null;
  async get(key: string, options?: { cacheTtl?: number }) {
    this.reads.push(key);
    this.options.push({ key, ...options });
    if (this.gate) await this.gate;
    if (this.failing) throw new Error("KV unavailable");
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
  count(key: string) {
    return this.reads.filter((k) => k === key).length;
  }
}

let pack: KnowledgePack;
let fallback: KnowledgePack;
let json: string;
let pin: PackPin;
/** A second published version (other content date). */
let json2: string;
let version2: string;

beforeAll(() => {
  const built = buildRepoPack("2026-10-11");
  pack = built.pack;
  const artifacts = buildPackArtifacts(pack, built.safety.blocklist);
  json = artifacts.json;
  pin = artifacts.meta;
  fallback = buildFallbackPack(pack);
  const other = buildRepoPack("2026-12-01");
  json2 = buildPackArtifacts(other.pack, other.safety.blocklist).json;
  version2 = other.pack.packVersion;
});

const pointerFor = (value: string, extra: Record<string, unknown> = {}) => {
  const meta = packMeta(value);
  return JSON.stringify({ schema: meta.schema, version: meta.version, packDate: meta.packDate, sha256: meta.sha256, bytes: meta.bytes, ...extra });
};

function setup(options: { pointer?: string | null; values?: Record<string, string>; clock?: { t: number } } = {}) {
  const kv = new CountingKv();
  const values = options.values ?? { [packKey(pin.version)]: json };
  for (const [k, v] of Object.entries(values)) kv.store.set(k, v);
  const pointer = options.pointer === undefined ? pointerFor(json) : options.pointer;
  if (pointer !== null) kv.store.set(POINTER_KEY, pointer);
  const clock = options.clock ?? { t: 1_000_000 };
  const source = createPackSource({ fallback, pin, now: () => clock.t });
  const env: AskEnv = { ASK_KV: kv };
  return { kv, source, env, clock };
}

describe("pack source", () => {
  it("keeps the served required chunks in step with the build", () => {
    expect([...SERVED_REQUIRED_CHUNKS]).toEqual([...REQUIRED_CHUNKS]);
  });

  it("reads the pointer and the value from KV with their location caches", async () => {
    const { kv, source, env } = setup();
    const loaded = await source.load(env);
    expect(loaded.tier).toBe("kv");
    expect(loaded.pack.packVersion).toBe(pack.packVersion);
    expect(loaded.vocabulary.has("metrodata")).toBe(true);
    expect(kv.options).toEqual([
      { key: POINTER_KEY, cacheTtl: 60 },
      { key: packKey(pin.version), cacheTtl: VALUE_CACHE_TTL },
    ]);
  });

  it("serves from memory within the pointer TTL and re-reads only the pointer after it", async () => {
    const { kv, source, env, clock } = setup();
    await source.load(env);
    clock.t += POINTER_TTL_MS - 1;
    expect((await source.load(env)).tier).toBe("memory");
    expect(kv.reads).toHaveLength(2);
    clock.t += 2;
    expect((await source.load(env)).tier).toBe("memory");
    expect(kv.count(POINTER_KEY)).toBe(2);
    expect(kv.count(packKey(pin.version))).toBe(1);
  });

  it("reads each new version once after a flip", async () => {
    const { kv, source, env, clock } = setup({ values: { [packKey(pin.version)]: json, [packKey(version2)]: json2 } });
    await source.load(env);
    kv.store.set(POINTER_KEY, pointerFor(json2));
    clock.t += POINTER_TTL_MS;
    const loaded = await source.load(env);
    expect(loaded.tier).toBe("kv");
    expect(loaded.pack.packVersion).toBe(version2);
    clock.t += POINTER_TTL_MS;
    expect((await source.load(env)).pack.packVersion).toBe(version2);
    expect(kv.count(packKey(version2))).toBe(1);
  });

  it("falls back to the pin when the pointer's value fails its hash", async () => {
    const tampered = json.replace('"profile"', '"profile" ');
    const { source, env } = setup({ pointer: pointerFor(json2), values: { [packKey(pin.version)]: json, [packKey(version2)]: tampered } });
    const loaded = await source.load(env);
    expect(loaded.tier).toBe("pin");
    expect(loaded.pack.packVersion).toBe(pin.version);
  });

  it("falls back to the pin for another schema, malformed JSON, a missing value or a bad pointer", async () => {
    const cases: { pointer: string | null; values?: Record<string, string> }[] = [
      { pointer: pointerFor(json2).replace('"schema":1', '"schema":2') },
      { pointer: pointerFor(json2), values: { [packKey(pin.version)]: json } },
      { pointer: "{not json" },
      { pointer: null },
    ];
    for (const c of cases) {
      const { source, env } = setup({ pointer: c.pointer, values: c.values ?? { [packKey(pin.version)]: json, [packKey(version2)]: json2 } });
      expect((await source.load(env)).tier, String(c.pointer)).toBe("pin");
    }
    // A value whose bytes hash right but are not a servable StoredPack.
    const bad = JSON.stringify({ schema: 1, pack: { packVersion: version2 } });
    const sha = createHash("sha256").update(bad).digest("hex");
    const { source, env } = setup({ pointer: JSON.stringify({ schema: 1, version: version2, packDate: "2026-12-01", sha256: sha, bytes: bad.length }), values: { [packKey(pin.version)]: json, [packKey(version2)]: bad } });
    expect((await source.load(env)).tier).toBe("pin");
  });

  it("serves the fallback when neither the pointer nor the pin is servable, and does not re-read a rejected value", async () => {
    const { kv, source, env, clock } = setup({ pointer: pointerFor(json2), values: {} });
    const loaded = await source.load(env);
    expect(loaded.tier).toBe("fallback");
    expect(loaded.pack.packVersion).toBe(fallback.packVersion);
    expect(loaded.pack.chunks.map((c) => c.id)).toContain("contact");
    clock.t += 1000;
    expect((await source.load(env)).tier).toBe("fallback");
    clock.t += POINTER_TTL_MS;
    await source.load(env);
    expect(kv.count(packKey(version2))).toBe(1);
    expect(kv.count(packKey(pin.version))).toBe(1);
  });

  it("serves the fallback when KV throws and stays off KV for 10 s", async () => {
    const { kv, source, env, clock } = setup();
    kv.failing = true;
    expect((await source.load(env)).tier).toBe("fallback");
    clock.t += NEGATIVE_TTL_MS - 1;
    expect((await source.load(env)).tier).toBe("fallback");
    expect(kv.reads).toHaveLength(1);
    kv.failing = false;
    clock.t += 1;
    expect((await source.load(env)).tier).toBe("kv");
  });

  it("keeps serving its loaded pack when a pointer re-read fails", async () => {
    const { kv, source, env, clock } = setup();
    await source.load(env);
    kv.failing = true;
    clock.t += POINTER_TTL_MS;
    const loaded = await source.load(env);
    expect(loaded.tier).toBe("memory");
    expect(loaded.pack.packVersion).toBe(pin.version);
  });

  it("shares one in-flight load between concurrent requests", async () => {
    const { kv, source, env } = setup();
    let release!: () => void;
    kv.gate = new Promise((r) => (release = r));
    const both = Promise.all([source.load(env), source.load(env), source.load(env)]);
    release();
    const results = await both;
    expect(results.every((r) => r.pack === results[0].pack)).toBe(true);
    expect(kv.count(POINTER_KEY)).toBe(1);
    expect(kv.count(packKey(pin.version))).toBe(1);
  });

  it("reads nothing with ASK_PACK_SOURCE=bundle or without ASK_KV", async () => {
    const { kv, source } = setup();
    const bundled = await source.load({ ASK_KV: kv, ASK_PACK_SOURCE: "bundle" });
    expect(bundled.tier).toBe("fallback");
    expect(await source.packDate({ ASK_KV: kv, ASK_PACK_SOURCE: "bundle" })).toBe(fallback.packDate);
    expect(kv.reads).toEqual([]);
    expect((await source.load({})).tier).toBe("fallback");
  });

  it("dates the status from the pointer, else the pin", async () => {
    const { kv, source, env } = setup({ pointer: pointerFor(json2), values: { [packKey(version2)]: json2 } });
    expect(await source.packDate(env)).toBe(JSON.parse(json2).pack.packDate);
    expect(await source.packDate(env)).toBe("2026-12-01");
    expect(kv.count(POINTER_KEY)).toBe(1);
    const failing = setup();
    failing.kv.failing = true;
    expect(await failing.source.packDate(failing.env)).toBe(pin.packDate);
  });

  it("parses only well-formed pointers", () => {
    expect(parsePointer(null)).toBeNull();
    expect(parsePointer('{"schema":1,"version":"x","sha256":"y"}')).toBeNull();
    expect(parsePointer(pointerFor(json))?.version).toBe(pin.version);
  });

  it("serves exactly what was stored", async () => {
    const { source, env } = setup();
    const loaded = await source.load(env);
    expect(loaded.pack).toEqual((JSON.parse(json) as StoredPack).pack);
  });
});
