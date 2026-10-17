# Ask Groq Backup Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: in progress (owner request 2026-10-18).

**Goal:** Ask Rover Assistant keeps giving real, grounded answers after the Workers AI free quota (10,000 neurons per day, reset at 00:00 UTC) runs out, by adding two free Groq tiers behind Gemma and Mistral.

**Architecture:** `generate` in `functions/_lib/model.ts` walks an ordered tier list: Gemma (primary) and Mistral (fallback) on the Workers AI binding, then Groq `qwen/qwen3.8-27b` and Groq `openai/gpt-oss-120b` (source `backup`) over the OpenAI-compatible Groq API, routed through the existing AI Gateway when the binding exposes `gateway(id).getUrl("groq")`. A per-key model breaker (in-memory plus KV `mb:<key>`) skips a provider or model that is out of quota, rate limited, unauthorized or removed. Every tier gets the same messages and the same output checks in `runPipeline`; the handler logs the answering model and the failure trail to Analytics Engine.

**Tech Stack:** Cloudflare Pages Functions (TypeScript, no new runtime dependencies), Workers AI binding, AI Gateway, Groq OpenAI-compatible REST API, Workers KV, Analytics Engine, Vitest, Bun.

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, docs, copy, commits.
- No new runtime dependencies in `functions/` (T12); `fetch` only.
- Chain: Gemma, then Mistral (Workers AI), then Groq `qwen/qwen3.8-27b`, then Groq `openai/gpt-oss-120b`, then the existing canned fallback.
- A Workers AI quota error (code 3036, "daily free allocation", neurons) skips Mistral and goes straight to Groq. Any other Workers AI error or timeout tries Mistral first.
- Qwen request: `reasoning_effort: "none"`. gpt-oss request: `reasoning_effort: "low"`, `include_reasoning: false`, `max_completion_tokens: 1024` (room for reasoning plus a 300-token answer). Reasoning text never reaches visitors (never read `message.reasoning`; strip `<think>` blocks).
- A Qwen 404 or model-not-found falls through to gpt-oss and opens that model's breaker.
- `GROQ_API_KEY` is a Pages secret (production, project `kurniadi`). Unset means the Groq tiers are skipped with no fetch.
- Same grounded prompt, context, history, scope rules and output checks for every tier. Keep the system prompt a stable prefix (Groq prompt caching).
- Bilingual copy (EN and ID) for the privacy note; employers Metrodata and MII may be named, client companies never.
- Do not push or trigger CI until the coordinator says the faster-CI PRs merged; then rebase onto main (and onto PR #196, multi-turn memory, once merged) and push one PR.

---

## File map

| File | Change |
|---|---|
| `functions/_lib/model.ts` | `UpstreamError`, quota classification, Groq request params in `modelInput`, tier chain with backups, breaker and deadline in `generate`, `Generation.model` |
| `functions/_lib/limits.ts` | `ModelBreaker` interface and `modelBreaker(kv)` (in-memory plus KV `mb:<key>`), `resetModelBreakers()` |
| `functions/_lib/groq.ts` (new) | `groqClient`, `stripReasoning`, `retryAfterSeconds`, `groqBaseUrl`, `backupTiers`, defaults |
| `functions/_lib/pipeline.ts` | `backups` and `breaker` inputs, `model` on the result |
| `functions/_lib/handler.ts` | build backups from env, pass the breaker, cache `backup` answers, log blob10 (model) and blob11 (failure trail) |
| `functions/_lib/types.ts` | `GROQ_API_KEY`, `ASK_BACKUP_MODELS` on `AskEnv`; optional `gateway()` on `AiBinding` |
| `src/ask/protocol.ts`, `src/ask/client.ts` | `AskSource` gains `"backup"` |
| `scripts/ask-eval.ts` | `--groq <model>` and `--gateway` live check, usage summary |
| `scripts/content-gap.ts` | "Models" table from blob10 |
| `wrangler.toml` | secret comment, `ASK_BACKUP_MODELS` var, blob layout comment |
| Docs and copy | `docs/agents/ask.md`, `docs/ask-runbook.md`, `docs/features.md`, `README.md`, `docs/decisions.md`, `docs/superpowers/README.md`, `messages/en.json`, `messages/id.json` (`ask.privacy`), `content/build-story.json`, `content/ask/site-build.json` if it names the models |
| Tests | `tests/ask/backup.test.ts` (new), `tests/ask/groq.test.ts` (new), `tests/ask/handler.test.ts`, `tests/unit/content-gap.test.ts` |

---

### Task 1: Tier chain, quota classification and the model breaker

**Files:**
- Modify: `functions/_lib/model.ts`, `functions/_lib/limits.ts`
- Test: `tests/ask/backup.test.ts` (new)

**Interfaces (produces):**

```ts
// model.ts
export type AttemptFailure = "error" | "first_token_timeout" | "total_timeout" | "empty" | "quota" | "rate_limited" | "unavailable" | "auth" | "breaker_open" | "deadline";
export type UpstreamReason = "quota" | "rate_limited" | "unavailable" | "auth" | "error";
export class UpstreamError extends Error { constructor(readonly reason: UpstreamReason, readonly retryAfterSec?: number, message?: string) }
export function isQuotaError(error: unknown): boolean; // /\b(3036|4006)\b|daily free allocation|neurons/i on message
export interface ModelInput { messages; max_tokens; temperature; chat_template_kwargs?; reasoning_effort?: "none" | "low"; include_reasoning?: boolean }
export const GPT_OSS_MAX_TOKENS = 1024;
export const GROQ_TIMEOUTS: Timeouts = { firstTokenMs: 6000, totalMs: 6000 };
export const CHAIN_MS = 24_000; // client stream timeout is 30 s
export const MIN_ATTEMPT_MS = 1500;
export interface BackupTier { model: string; client: ModelClient; timeouts?: Timeouts }
export interface ModelBreaker { isOpen(key: string, now: number): Promise<boolean>; trip(key: string, seconds: number, now: number): Promise<void> }
export interface GenerateOptions { backups?: BackupTier[]; breaker?: ModelBreaker; deadlineMs?: number; now?: () => number }
export interface Generation { text: string; source: "primary" | "fallback" | "backup" | "none"; model?: string; failures: { model: string; reason: AttemptFailure; retryAfterSec?: number }[] }
export function generate(client, models, messages, t?, opts?: GenerateOptions): Promise<Generation>;
export const WORKERS_AI_KEY = "wai"; export const groqKey = (model: string) => `groq:${model}`;
export const UNAVAILABLE_SECONDS = 6 * 3600; export const AUTH_SECONDS = 3600; export const RATE_LIMIT_DEFAULT_SECONDS = 60;
// limits.ts
export function modelBreaker(kv: KvNamespace | undefined): ModelBreaker;
export function resetModelBreakers(): void;
```

Behaviour of `generate`:
- Tiers: `[primary (wai), fallback (wai, if set and different), ...backups (groq:<model>, source "backup", timeouts default GROQ_TIMEOUTS)]`.
- Before a tier: if its key is quota-skipped in this call or `breaker.isOpen(key)` is true, record `breaker_open` and continue. If less than `MIN_ATTEMPT_MS` remains of `deadlineMs` (default `CHAIN_MS`), record `deadline` and continue. Clamp the tier timeouts to the remaining budget.
- `attempt` maps errors: `UpstreamError` to its reason (keeping `retryAfterSec`), `isQuotaError` to `quota`, anything else to `error`.
- On failure: `quota` marks the tier's key skipped for the rest of this call and trips it until the next UTC midnight (`secondsToMidnight`); on a backup tier, `rate_limited` trips `retryAfterSec ?? 60`, `auth` trips `AUTH_SECONDS`, `unavailable` trips `UNAVAILABLE_SECONDS`. Timeouts, `error` and `empty` never trip.
- Success returns `{ text, source, model, failures }`.

`modelInput`: Gemma keeps `enable_thinking: false`; a model matching `/qwen/i` gets `reasoning_effort: "none"`; `/gpt-oss/i` gets `reasoning_effort: "low"`, `include_reasoning: false`, `max_tokens: GPT_OSS_MAX_TOKENS`.

`modelBreaker(kv)`: in-memory `Map<key, untilMs>` checked first; then KV `mb:<key>` (value `untilMs`, read errors fail open). `trip` sets memory and, only when `seconds >= 60`, writes KV with `expirationTtl: Math.ceil(seconds) + 60` (KV writes are scarce: 1,000 per day).

- [ ] **Step 1: Write failing tests** in `tests/ask/backup.test.ts` with the `mock`/`say` helpers from `tests/ask/pipeline.test.ts` (model name keys `p`, `f`, `qwen/qwen3.8-27b`, `openai/gpt-oss-120b`), covering: quota error on primary skips Mistral and Qwen answers (`source: "backup"`, `model: "qwen/qwen3.8-27b"`, calls `[p, qwen]`); generic error tries Mistral; timeout tries Mistral; Mistral failing too reaches Qwen; Qwen `UpstreamError("unavailable")` reaches gpt-oss and trips `groq:qwen/qwen3.8-27b` for 6 h; Qwen `UpstreamError("rate_limited", 42)` reaches gpt-oss and trips for 42 s; both Groq tiers failing returns `source: "none"`; an open breaker skips a model without calling it; quota trips `wai` so the next call skips both Workers AI tiers; no backups keeps the two-model behaviour; deadline skips remaining tiers; `modelInput` params for qwen and gpt-oss; `modelBreaker` memory, KV read, no KV write under 60 s.
- [ ] **Step 2:** `bunx vitest run tests/ask/backup.test.ts` fails.
- [ ] **Step 3:** Implement in `model.ts` and `limits.ts`.
- [ ] **Step 4:** `bunx vitest run tests/ask/backup.test.ts tests/ask/pipeline.test.ts` passes.
- [ ] **Step 5:** Commit `feat(ask): tier chain with quota skip, model breaker and deadline`.

### Task 2: Groq client

**Files:**
- Create: `functions/_lib/groq.ts`
- Modify: `functions/_lib/types.ts`
- Test: `tests/ask/groq.test.ts` (new)

**Interfaces:**
- Consumes: `ModelClient`, `ModelInput`, `UpstreamError`, `BackupTier`, `GROQ_TIMEOUTS` from Task 1.
- Produces:

```ts
export const GROQ_DIRECT_URL = "https://api.groq.com/openai/v1";
export const DEFAULT_BACKUP_MODELS = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"];
export interface GroqUsage { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
export interface GroqOptions { apiKey: string; baseUrl: () => Promise<string>; fetcher?: typeof fetch; metadata?: Record<string, string>; viaGateway?: boolean; skipCache?: boolean; onUsage?: (model: string, usage: GroqUsage) => void }
export function stripReasoning(text: string): string;          // drops <think>...</think>; an unclosed <think> drops the rest
export function retryAfterSeconds(headers: Headers): number | undefined; // retry-after, else max of x-ratelimit-reset-requests/-tokens ("7.66s", "2m59.56s", "1h2m")
export function groqClient(options: GroqOptions): ModelClient;
export function groqBaseUrl(env: AskEnv): () => Promise<string>; // memoized; AI.gateway(ASK_GATEWAY_ID).getUrl("groq") without trailing slash, else GROQ_DIRECT_URL
export function backupTiers(env: AskEnv, metadata: Record<string, string>, fetcher?: typeof fetch): BackupTier[]; // [] without GROQ_API_KEY; models from ASK_BACKUP_MODELS (comma list) or defaults
```

`groqClient.stream(model, input, signal)`: POST `${base}/chat/completions`, `Authorization: Bearer <key>`, body `{ model, messages, temperature, max_completion_tokens: input.max_tokens, stream: false, ...(reasoning_effort), ...(include_reasoning !== undefined) }`. Through the gateway add `cf-aig-metadata: JSON.stringify(metadata)` and, with `skipCache`, `cf-aig-skip-cache: true`. Status mapping: 429 and 413 to `rate_limited` (with `retryAfterSeconds`), 401 and 403 to `auth`, 404 to `unavailable`, 400 whose `error.code` is `model_not_found` or `model_decommissioned` (or message `/model\b.*(not found|does not exist|decommissioned)/i`) to `unavailable`, other non-OK to `error`. On 200: `stripReasoning(choices[0].message.content)`, report `usage` to `onUsage`, yield when non-empty. `AiBinding` gets `gateway?(id: string): { getUrl(provider?: string): Promise<string> }`; `AskEnv` gets `GROQ_API_KEY?` and `ASK_BACKUP_MODELS?`.

- [ ] **Step 1: Failing tests**: request URL, headers and body per model (qwen `reasoning_effort: "none"`, gpt-oss `low` plus `include_reasoning: false` plus 1024); `<think>` stripped and `message.reasoning` ignored; each status mapping; `retryAfterSeconds` formats; gateway URL from the binding, direct fallback when `gateway` is missing or throws; `backupTiers` empty without the key, order and override via `ASK_BACKUP_MODELS`.
- [ ] **Step 2:** `bunx vitest run tests/ask/groq.test.ts` fails.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Passes, plus `bun run typecheck`.
- [ ] **Step 5:** Commit `feat(ask): Groq client for backup tiers`.

### Task 3: Pipeline, handler, protocol and logs

**Files:**
- Modify: `functions/_lib/pipeline.ts`, `functions/_lib/handler.ts`, `src/ask/protocol.ts`, `src/ask/client.ts`
- Test: `tests/ask/handler.test.ts`

**Interfaces:**
- Consumes: `generate(..., opts)`, `modelBreaker`, `backupTiers`, `groqBaseUrl`.
- Produces: `PipelineInput.backups?: BackupTier[]`, `PipelineInput.breaker?: ModelBreaker`, `PipelineResult.model?: string`; `AskSource = "primary" | "fallback" | "backup" | "cache" | "none"`; `HandlerDeps.groqFetch?: typeof fetch`; Analytics Engine blobs gain blob10 (answering model id or "") and blob11 (failure trail `model:reason > model:reason`, at most 200 characters).

Handler: `const backups = backupTiers(env, metadata, deps.groqFetch)`; pass `backups` and `breaker: modelBreaker(env.ASK_KV)` to `runPipeline`; cache answers whose source is `primary`, `fallback` or `backup`.

- [ ] **Step 1: Failing tests** (extend `setup` with an optional `groq` fetch mock and `ASK_KV` reuse): quota error from the Workers AI mock with `GROQ_API_KEY` set returns the Groq answer, `done.source === "backup"`, blob3 `backup`, blob10 `qwen/qwen3.8-27b`, blob11 contains `quota`, the answer is cached; without `GROQ_API_KEY` the same error gives the canned fallback and the Groq fetch is never called; a leaking Groq answer (a blocklisted client name) is replaced by the output checks like any tier.
- [ ] **Step 2:** Fails. **Step 3:** Implement. **Step 4:** `bunx vitest run tests/ask` and `bun run typecheck` pass.
- [ ] **Step 5:** Commit `feat(ask): Groq backup tiers in the Ask Function, logged by model`.

### Task 4: Live check and weekly report

**Files:**
- Modify: `scripts/ask-eval.ts`, `scripts/content-gap.ts`
- Test: `tests/unit/content-gap.test.ts`

- `bun scripts/ask-eval.ts golden --groq <model> [--gateway] --only ...`: needs `GROQ_API_KEY` (and `CF_ACCOUNT_ID` with `--gateway`, base `https://gateway.ai.cloudflare.com/v1/<account>/shinyq-hq/groq`, cache skipped). Runs the same pipeline with `client = groqClient(...)`, `models = { primary: <model> }`, timeouts 15 s, one question at a time; on a `rate_limited` failure waits `retryAfterSec` (at most 65 s) and retries up to 3 times. Prints per question: pass, outcome, latency, answer length, prompt, cached and completion tokens; then a summary (pass count, median and max latency, mean length, mean tokens, an estimate of questions per day under 200K tokens and 1K requests per day).
- `content-gap.ts`: a `models` query on blob10 and a "Models" table (only when rows exist).
- [ ] Steps: failing test for the Models table, implement, `bunx vitest run tests/unit/content-gap.test.ts`, commit `feat(ask): Groq live check in ask-eval and a models table in the weekly report`.

### Task 5: Docs and copy

- `messages/en.json` and `messages/id.json` `ask.privacy`: name Groq as the backup processor (with Zero Data Retention). EN: "Questions and answers are processed by Cloudflare Workers AI, or by Groq (zero data retention) when its daily quota runs out." ID: "Pertanyaan dan jawaban diproses oleh Cloudflare Workers AI, atau oleh Groq (tanpa penyimpanan data) saat kuota hariannya habis."
- `wrangler.toml`: `GROQ_API_KEY` in the secrets comment, `ASK_BACKUP_MODELS` var, blob layout with blob10 and blob11.
- `docs/agents/ask.md` (bindings table, security order step 9, a "Backup tiers" section), `docs/ask-runbook.md` (section 14 limits, secrets, incident: swap or drop a Groq model), `docs/features.md`, `README.md` (one bullet and the diagram node), `content/build-story.json`, `content/ask/site-build.json` and `tests/ask/pack.test.ts` if they name the models, `docs/decisions.md` dated row, `docs/superpowers/README.md` plan entry.
- [ ] Steps: edit, `bun run verify:quick`, commit `docs(ask): Groq backup tiers`.

### Task 6: Integration

- [ ] Wait for the coordinator's go (faster-CI PRs merged). Rebase onto main; if PR #196 merged, resolve conflicts so the Groq tiers get the same `messages` (history included) and run `bunx vitest run tests/ask`.
- [ ] Live checks: owner runs the Groq commands; Workers AI at most 5 questions (`bun scripts/ask-eval.ts golden --cli --only q01,q03,q10,q45,q50`).
- [ ] `bun run verify:quick`, `bun run e2e:changed`, check no CI run in flight, push, open the PR, merge when green, deploy with `gh workflow run deploy.yml --ref main`.
