# Ask the HQ, part B: knowledge pack in Workers KV Implementation Plan

Status: in progress

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the Ask knowledge pack from Workers KV as versioned, immutable, validated values behind a `pack:current` pointer, with per-isolate memory, a pinned version and a small bundled fallback, published and rolled back together with the Pages deploy, inside the free tiers.

**Architecture:** The build writes the pack with a precomputed BM25 index (`StoredPack`), a small fallback pack and the bundle's pin. `functions/_lib/pack-source.ts` resolves the pack per request (memory, KV pointer and value with SHA-256, schema and shape checks, the pin, the fallback). `scripts/ask-pack.ts` publishes, flips, pins and rolls back over the KV REST API; `deploy.yml` publishes before `wrangler pages deploy` and flips after it; `rollback.yml` flips to the rolled-back commit's pack.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, Workers KV (REST API and binding), Web Crypto SHA-256, GitHub Actions, Vitest, Bun.

Spec: [`docs/superpowers/specs/2026-10-19-ask-kv-pack-and-rover-voice-design.md`](../specs/2026-10-19-ask-kv-pack-and-rover-voice-design.md) (section 4).

## Global Constraints

- No em dashes (U+2014) anywhere.
- Namespace: the existing `ASK_KV` (`shinyq-hq-ask`), keys `pack:v1:<packVersion>`, `pack:current`, `pack:index`, `pack:commit:<sha>`; `PACK_SCHEMA = 1`.
- Budgets: `PACK_MAX_BYTES` 384 KiB (text pack), `PACK_VALUE_MAX_BYTES` 768 KiB (indexed value), `FALLBACK_MAX_BYTES` 24 KiB; keep the last 10 versions (`PACK_KEEP = 10`).
- Read path: pointer re-read at most every 60 s (`POINTER_TTL_MS`), `cacheTtl` 60 for the pointer and 86,400 for values, negative cache 10 s after a failed load, one in-flight load per isolate.
- The safety blocklist stays bundled (`functions/_generated/safety.json`), never in KV.
- Kill switch var `ASK_PACK_SOURCE`: `kv` (default) or `bundle` (fallback pack only, no KV reads).
- Cloudflare secrets only in step-level `env` of jobs in the `production` environment (H1); wrangler from the lockfile.
- No new runtime dependencies in `functions/` (T12); scripts use `fetch` only.
- Answer cache keys and history signatures keep using `packVersion` (the fallback pack has its own).

---

### Task 1: Stored pack and hydrated index

**Files:**
- Modify: `functions/_lib/pack-index.ts`, `functions/_lib/retrieve.ts` (`scoreChunks`, `leadMatches` read postings), `functions/_lib/types.ts` (`StoredPack`)
- Test: `tests/ask/pack-index.test.ts` (new)

**Interfaces:**
- Produces: `PACK_SCHEMA = 1`; `interface StoredPack { schema: 1; pack: KnowledgePack; index: { terms: string[]; postings: number[][]; len: number[]; vocabulary: string } }`; `storePack(pack): StoredPack`; `hydratePack(stored): { pack: KnowledgePack; index: PackIndex }` (registers the index for `indexPack(pack)` so callers stay unchanged); `PackIndex` gains `tfOf(chunk: number, term: string): number` and `postingsOf(term): ReadonlyMap<number, number>` (lazy per term), keeping `df`, `len`, `avgLen`, `vocabulary`.

- [ ] Failing test: for the repo pack, `hydratePack(JSON.parse(JSON.stringify(storePack(pack))))` gives the same `df`, `len`, `avgLen`, vocabulary and, for every golden and curated question, the same `scoreChunks` scores and `retrieve` chunk ids as `indexPack(pack)` built from text.
- [ ] Implement; `scoreChunks` loops over query terms and their postings (term at a time) instead of per-chunk maps.
- [ ] `bun run test tests/ask` PASS; commit `feat(ask): stored pack with a precomputed BM25 index`.

### Task 2: Build outputs and budgets

**Files:**
- Modify: `scripts/build-knowledge.ts`, `src/ask/pack.ts` (`PACK_MAX_BYTES` 384 KiB, `PACK_VALUE_MAX_BYTES`, `FALLBACK_MAX_BYTES`, `FALLBACK_CHUNKS = ["profile", "now", "contact", "site-build", "principles"]`, `buildFallbackPack(pack)`, `validateStoredPack(stored, blocklist): string[]`), `src/ask/repo-pack.ts`
- Test: `tests/ask/pack.test.ts`; new non-gating bench `tests/bench/pack-parse.bench.ts`

**Interfaces:**
- Produces: `functions/_generated/pack.json` (`StoredPack`), `functions/_generated/fallback.json` (`StoredPack` of the fallback, its own `packVersion`), `functions/_generated/pack-meta.json` (`{ schema, version, packDate, sha256, bytes }`, `sha256` hex of the exact `pack.json` bytes); `knowledge.json` is no longer written (update every importer: `functions/api/ask.ts`, tests, `scripts/ask-eval.ts` if it reads it).

- [ ] Failing tests: budgets, fallback holds exactly `FALLBACK_CHUNKS`, `validateStoredPack` rejects a missing required chunk, a wrong schema, index arrays of the wrong length, blocklisted text, and an oversized value.
- [ ] Implement; the bench prints `JSON.parse` and hydrate times of the real value.
- [ ] Commit `feat(ask): build the indexed pack, the fallback and the pin`.

### Task 3: Read path

**Files:**
- Create: `functions/_lib/pack-source.ts`
- Modify: `functions/_lib/types.ts` (`AskEnv.ASK_PACK_SOURCE?: string`)
- Test: `tests/ask/pack-source.test.ts`

**Interfaces:**
- Produces:

```ts
export type PackTier = "memory" | "kv" | "pin" | "fallback";
export interface LoadedPack { pack: KnowledgePack; vocabulary: ReadonlySet<string>; tier: PackTier }
export interface PackPointer { schema: number; version: string; packDate: string; sha256: string; bytes: number; commit?: string; publishedAt?: string }
export interface PackSourceOptions { fallback: StoredPack; pin: { schema: number; version: string; sha256: string }; now?: () => number }
export function createPackSource(options: PackSourceOptions): {
  load(env: AskEnv): Promise<LoadedPack>;
  /** Pointer only (status `asOf`); falls back to the pin's or the fallback's date. */
  packDate(env: AskEnv): Promise<string>;
};
```

- [ ] Failing tests with an in-memory KV that counts reads: memory reuse within 60 s; pointer re-read after 60 s; value read once per version; SHA-256 mismatch, schema mismatch, malformed JSON, missing value: pin, then fallback; KV throwing: fallback and no new read for 10 s; two concurrent loads share one read; `ASK_PACK_SOURCE = "bundle"` reads nothing; no `ASK_KV`: fallback.
- [ ] Implement with `crypto.subtle.digest("SHA-256", bytes)` on the exact value text.
- [ ] Commit `feat(ask): pack source with memory, KV, pin and fallback tiers`.

### Task 4: Handler, entry and analytics

**Files:**
- Modify: `functions/_lib/handler.ts` (`HandlerDeps.source` replaces `pack`; the pack is resolved per request; `status` uses `packDate`), `functions/api/ask.ts` (imports `fallback.json`, `pack-meta.json`, `safety.json` only), `scripts/content-gap.ts` (Pack tier table from blob12), `wrangler.toml` (comments, `ASK_PACK_SOURCE = "kv"`)
- Test: `tests/ask/handler.test.ts` (a static source helper keeps the existing tests), new cases for the tier blob and `asOf`.

**Interfaces:**
- Consumes: `createPackSource` (Task 3).
- Produces: Analytics Engine blob12 = `PackTier` on every event.

- [ ] Failing tests, implement, `bun run test tests/ask`, commit `feat(ask): the Function reads the pack from KV`.

### Task 5: Publish, flip, pin and rollback script

**Files:**
- Create: `scripts/ask-pack.ts`
- Test: `tests/unit/ask-pack-script.test.ts`

**Interfaces:**
- CLI: `bun scripts/ask-pack.ts publish --commit <sha>` | `flip <version>` | `pin <version>` | `rollback --commit <sha> [--dry-run true]` | `status`. Env `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; namespace id parsed from `wrangler.toml` (`binding = "ASK_KV"`). Writes `previous=<version>` and `version=<version>` to `$GITHUB_OUTPUT` when set.
- Exported pure functions for tests: `planPublish(index, stored, meta, commit, now)`, `planPrune(index, current, keep)`, `kvClient(fetch, account, namespace, token)`.

- [ ] Failing tests against a fake REST API: publish uploads once (idempotent when the same hash exists, fails on a different hash), writes `pack:commit:<sha>` with `expiration_ttl` 34,560,000, updates and prunes `pack:index` (never the current version); `flip` refuses a version not in the index or whose value no longer validates; `rollback --commit` flips to the commit's version or no-ops with a note; a 403 prints "add Workers KV Storage: Edit to CLOUDFLARE_API_TOKEN".
- [ ] Implement, commit `feat(ask): ask-pack publish, flip, pin and rollback`.

### Task 6: Deploy and rollback workflows

**Files:**
- Modify: `.github/workflows/deploy.yml` (deploy job: `publish` after the pack build and before `Deploy to Cloudflare Pages`; `flip` right after it; a final `if: failure() && steps.publish.outputs.previous != ''` step flips back), `.github/workflows/rollback.yml` and `scripts/rollback.ts` (after a real Pages rollback, `ask-pack.ts rollback --commit <target sha>`; dry runs print it), `scripts/deploy-smoke.ts` (status `asOf` equals the published `packDate`)
- Test: `tests/unit/workflows.test.ts`, `tests/unit/rollback.test.ts` (or the existing rollback test file)

- [ ] Failing workflow tests: step order publish < pages deploy < flip; Cloudflare secrets only in step `env`; the rollback job runs the pack rollback after the Pages rollback.
- [ ] Implement, commit `ci(deploy): publish the Ask pack to KV and flip it with the deploy`.

### Task 7: Docs and decision

**Files:**
- Create: `docs/decisions/2026-10-19-ask-kv-pack.md` (cap replaced: 256 KiB text cap to 384 KiB text and 768 KiB indexed value, with the parse measurements)
- Modify: `docs/agents/ask.md` (Code, Bindings, Knowledge chunks pack size), `docs/ask-runbook.md` (sections 1, 3, 5, 6, 14, 15 and a new 17: upload, pointer flip, pin, rollback, kill switch `ASK_PACK_SOURCE`, the token permission), `docs/features.md`, `docs/agents/folder-layout.md`, this plan's status line.

- [ ] Write, run the docs tests, commit `docs(ask): knowledge pack in Workers KV`.

### Task 8: Verify and review

- [ ] `bun run verify:quick`, `bun run e2e:changed`; measure the Functions bundle (`bunx wrangler pages functions build`) before and after.
- [ ] Security review (KV integrity, rollback, token scope), fix findings.
- [ ] Open the PR (ready for review, base the PR-P branch until it merges), dispatch `ask-eval.yml` on the branch; merge when CI and the eval are green and the owner added the KV permission to the token.
