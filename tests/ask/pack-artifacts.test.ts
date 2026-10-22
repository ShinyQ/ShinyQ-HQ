import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildFallbackPack, buildPackArtifacts, FALLBACK_CHUNKS, FALLBACK_MAX_BYTES, PACK_MAX_BYTES, PACK_VALUE_MAX_BYTES, validateStoredPack, type PackArtifacts } from "@/ask/pack";
import { buildRepoPack } from "@/ask/repo-pack";
import { PACK_SCHEMA } from "../../functions/_lib/pack-index";
import type { KnowledgePack, StoredPack } from "../../functions/_lib/types";

let pack: KnowledgePack;
let artifacts: PackArtifacts;

beforeAll(() => {
  const built = buildRepoPack("2026-10-11");
  pack = built.pack;
  artifacts = buildPackArtifacts(pack);
});

const mutate = (change: (stored: StoredPack) => void) => {
  const stored = JSON.parse(artifacts.json) as StoredPack;
  change(stored);
  return JSON.stringify(stored);
};

describe("pack artifacts (KV value, fallback, pin)", () => {
  it("keeps the measured budgets", () => {
    expect(PACK_MAX_BYTES).toBe(384 * 1024);
    expect(PACK_VALUE_MAX_BYTES).toBe(768 * 1024);
    expect(FALLBACK_MAX_BYTES).toBe(24 * 1024);
    expect(artifacts.errors).toEqual([]);
    expect(artifacts.meta.bytes).toBeLessThan(PACK_VALUE_MAX_BYTES);
    expect(Buffer.byteLength(artifacts.fallbackJson)).toBeLessThan(FALLBACK_MAX_BYTES);
  });

  it("pins the exact bytes of the stored value", () => {
    expect(artifacts.meta).toEqual({
      schema: PACK_SCHEMA,
      version: pack.packVersion,
      packDate: pack.packDate,
      sha256: createHash("sha256").update(artifacts.json).digest("hex"),
      bytes: Buffer.byteLength(artifacts.json),
    });
  });

  it("builds a fallback of exactly the fallback chunks, with its own version", () => {
    const fallback = JSON.parse(artifacts.fallbackJson) as KnowledgePack;
    expect(fallback.chunks.map((c) => c.id)).toEqual([...FALLBACK_CHUNKS]);
    expect(fallback.packVersion).toMatch(/^[0-9a-f]{16}$/);
    expect(fallback.packVersion).not.toBe(pack.packVersion);
    expect(fallback.contact).toEqual(pack.contact);
    expect(fallback.packDate).toBe(pack.packDate);
    expect(buildFallbackPack(pack).packVersion).toBe(fallback.packVersion);
  });

  it("accepts the built value", () => {
    expect(validateStoredPack(artifacts.json)).toEqual([]);
  });

  it("rejects a value missing a required chunk", () => {
    const json = mutate((s) => (s.pack.chunks = s.pack.chunks.filter((c) => c.id !== "contact")));
    expect(validateStoredPack(json).join("\n")).toMatch(/missing required chunk "contact"/);
  });

  it("rejects a wrong schema", () => {
    const json = mutate((s) => ((s as { schema: number }).schema = 2));
    expect(validateStoredPack(json).join("\n")).toMatch(/schema 2 is not 1/);
  });

  it("rejects index arrays of the wrong length and an index that does not match the text", () => {
    expect(validateStoredPack(mutate((s) => s.index.postings.pop())).join("\n")).toMatch(/terms and postings differ/);
    expect(validateStoredPack(mutate((s) => s.index.len.pop())).join("\n")).toMatch(/lengths differ/);
    expect(validateStoredPack(mutate((s) => (s.index.postings[0] = [0, 99]))).join("\n")).toMatch(/index does not match the pack text/);
  });

  it("rejects an em dash in the text and a tampered packVersion", () => {
    const json = mutate((s) => (s.pack.chunks[0].text_en += " one \u2014 two"));
    const errors = validateStoredPack(json).join("\n");
    expect(errors).toMatch(/contains an em dash/);
    expect(errors).toMatch(/does not match the pack content/);
  });

  it("rejects an oversized value and malformed JSON", () => {
    expect(validateStoredPack(artifacts.json, { maxBytes: 1024 }).join("\n")).toMatch(/over the 1024 byte cap/);
    expect(validateStoredPack("{not json")).toEqual(["stored pack is not valid JSON"]);
    expect(validateStoredPack("null")).toEqual(["stored pack is not a StoredPack"]);
  });
});
