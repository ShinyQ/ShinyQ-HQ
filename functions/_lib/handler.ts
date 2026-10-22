import { ASK_MAX_QUESTION, isAskEntry, type AskTurn, type AskEntry, type AskError, type AskErrorCode, type AskFrame, type AskLocale, type AskOutcome, type AskSource, type AskStatus, type AskTag, isAskCite } from "../../src/ask/protocol";
import { STATS_TOPIC_OF } from "../../src/ask/suggestions";
import { backupTiers } from "./groq";
import { parseHistory, signTurn, verifyHistory } from "./history";
import { breakerOpen, countModelCall, DEFAULT_DAILY_CAP, globalDayCount, minuteAllowed, modelBreaker, PER_DAY, recordSample, secondsToMidnight, visitorDayCount } from "./limits";
import { bindingClient, DEFAULT_FALLBACK, DEFAULT_PRIMARY, type ModelClient } from "./model";
import { scrubPII } from "./pii";
import type { LoadedPack, PackSource } from "./pack-source";
import { runPipeline, type PipelineReason } from "./pipeline";
import { PROMPT_VERSION } from "./prompt";
import { retrieve } from "./retrieve";
import { isLeadQuestion, resolveNickname } from "./scope";
import { chipFor, topicOfTags } from "./askStats";
import { answerTags } from "./tags";
import { hasValidSession, issueSession, originAllowed, readCapped, sha256Hex, verifyTurnstile, visitorHash, type Fetcher } from "./security";
import { cleanText, detectLocale, normalizeDashes, normalizeQuestion } from "./text";
import type { AskEnv, PagesContext } from "./types";
import type { StatsTopic } from "../../src/lib/stats/protocol";

/** Expected outcomes, not model misbehaviour: they never count against the circuit breaker. */
const EXPECTED_REASONS: ReadonlySet<string> = new Set(["harmful", "private", "others", "general", "persona", "injection", "unsourced", "model_decline", "fit", "consulting"]);

/** Request pipeline in the security order of spec 7.4. */

/** The question plus up to 3 signed earlier turns (multi-turn memory, owner decision 2026-10-17). */
export const MAX_BODY_BYTES = 8192;
export const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const STREAM_PIECE = 24;
const STREAM_DELAY_MS = 15;

export interface HandlerDeps {
  /** Resolves the knowledge pack per request (functions/_lib/pack-source.ts: memory, KV, pin, fallback). */
  source: Pick<PackSource, "load" | "packDate">;
  /** Overrides (tests): clock, Turnstile fetch, model client. */
  now?: () => number;
  fetcher?: Fetcher;
  client?: (env: AskEnv, metadata: Record<string, string>) => ModelClient | undefined;
  /** Fetch used by the Groq backup tiers (tests). */
  groqFetch?: typeof fetch;
  streamDelayMs?: number;
}

/**
 * Fail closed: a site key without its secret (for example a preview deployment, which gets no
 * production secrets) keeps the feature off instead of running without Turnstile.
 */
const enabled = (env: AskEnv) => env.ASK_ENABLED === "true" && Boolean(env.AI) && !(env.TURNSTILE_SITE_KEY && !env.TURNSTILE_SECRET);
const turnstileOn = (env: AskEnv) => Boolean(env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY);

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...extra } });
}

function fail(status: number, error: AskErrorCode, retryAfter?: number): Response {
  const body: AskError = retryAfter ? { error, retryAfter } : { error };
  return json(body, status, retryAfter ? { "Retry-After": String(retryAfter) } : {});
}

interface ParsedBody {
  q: string;
  locale: AskLocale;
  token?: string;
  /** Entry point for analytics; unknown values become "". */
  entry: AskEntry | "";
  /** Curated chip id the client sent (checked against the question by `chipFor` before it is logged). */
  chip?: string;
  /** The client reports an automated browser; counting only, never a safety decision. */
  auto: boolean;
  /** Well-formed earlier turns, not yet verified. */
  history: AskTurn[];
}

function parseBody(raw: string): ParsedBody | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { q, locale, turnstileToken, source, chip, auto, history } = data as Record<string, unknown>;
  if (typeof q !== "string" || (locale !== "en" && locale !== "id")) return null;
  if (turnstileToken !== undefined && (typeof turnstileToken !== "string" || turnstileToken.length > 2048)) return null;
  if (source !== undefined && typeof source !== "string") return null;
  if (chip !== undefined && (typeof chip !== "string" || chip.length > 64)) return null;
  return { q, locale, token: turnstileToken as string | undefined, entry: isAskEntry(source) ? source : "", ...(chip ? { chip } : {}), auto: auto === true, history: parseHistory(history) };
}

/** SSE frames are JSON, so a model token can never break the event stream (T6). */
export function frame(data: AskFrame): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

type DoneFrame = Extract<AskFrame, { done: true }>;

/** Adds the follow-up tags to the final frame only when there are any. */
function withTags(done: DoneFrame, tags: AskTag[]): DoneFrame {
  return tags.length ? { ...done, tags } : done;
}

/** Splits vetted text into word-aligned pieces for the typing effect. */
export function pieces(text: string, size = STREAM_PIECE): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of text.split(/(?<=\s)/)) {
    if (current && current.length + word.length > size) {
      out.push(current);
      current = "";
    }
    current += word;
  }
  if (current) out.push(current);
  return out;
}

function streamResponse(text: string, done: Extract<AskFrame, { done: true }>, delayMs: number, headers: Record<string, string>): Response {
  const encoder = new TextEncoder();
  const parts = pieces(text);
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index < parts.length) {
        if (index > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        controller.enqueue(encoder.encode(frame({ delta: parts[index++] })));
        return;
      }
      controller.enqueue(encoder.encode(frame(done)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8", ...SECURITY_HEADERS, ...headers } });
}

export async function cacheKey(packVersion: string, locale: AskLocale, question: string): Promise<string> {
  return `ans:${await sha256Hex(`${packVersion}|${PROMPT_VERSION}|${locale}|${normalizeQuestion(question)}`)}`;
}

interface EventData {
  outcome: AskOutcome | "rejected";
  locale: AskLocale;
  source: AskSource | "";
  question?: string;
  reason?: PipelineReason | AskErrorCode | "";
  /** UI entry point (hero, dock, pill, followup, terminal, palette) or "". */
  entry: AskEntry | "";
  /** Public visit stats: the question's topic (chip topic, else from the answer tags) and curated chip id, or "". */
  topic?: StatsTopic | "";
  chip?: string;
  /** The client reported an automated browser (blob13 "auto"); the public stats leave these out. */
  auto?: boolean;
  /** Model that produced the text (backup tiers included), or "". */
  model?: string;
  /** Failed attempts before the answer, `model:reason > model:reason`, or "". */
  trail?: string;
  latencyMs: number;
  /** Earlier turns that reached the model (multi-turn memory); 0 for a first turn. */
  historyUsed?: number;
}

/**
 * Anonymized event (no IP, no raw question). Only unanswered questions keep their scrubbed text
 * (content gaps). Blobs: outcome, locale, model source, gap question, pack version, reason, entry point,
 * topic, chip id (these two feed the public visit stats), answering model id (blob10), failure trail
 * `model:reason > model:reason` cut at 200 characters (blob11), pack tier that served (blob12: memory, kv, pin,
 * fallback), "auto" when the client reported an automated browser (blob13, counting only, else ""). Appended so older queries keep working. Doubles: latency, count, earlier turns sent to the model.
 */
function logEvent(env: AskEnv, loaded: LoadedPack, e: EventData) {
  try {
    env.ASK_EVENTS?.writeDataPoint({
      blobs: [e.outcome, e.locale, e.source, e.outcome === "unknown" ? (e.question ?? "").slice(0, 300) : "", loaded.pack.packVersion, e.reason ?? "", e.entry, e.topic ?? "", e.chip ?? "", e.model ?? "", (e.trail ?? "").slice(0, 200), loaded.tier, e.auto ? "auto" : ""],
      doubles: [e.latencyMs, 1, e.historyUsed ?? 0],
      indexes: [e.outcome],
    });
  } catch {
    // Analytics must never break an answer.
  }
}

export function createAskHandler(deps: HandlerDeps) {
  const { source } = deps;
  const now = deps.now ?? (() => Date.now());
  const delay = deps.streamDelayMs ?? STREAM_DELAY_MS;

  async function status(env: AskEnv): Promise<Response> {
    const body: AskStatus = {
      enabled: enabled(env),
      turnstileSiteKey: turnstileOn(env) ? (env.TURNSTILE_SITE_KEY ?? null) : null,
      asOf: await source.packDate(env),
      maxLength: ASK_MAX_QUESTION,
    };
    return json(body, body.enabled ? 200 : 503, { "Cache-Control": "public, max-age=60" });
  }

  async function post(context: PagesContext): Promise<Response> {
    const { request, env } = context;
    const started = now();

    // 1. Kill switch and circuit breaker.
    if (!enabled(env)) return fail(503, "disabled");
    if (await breakerOpen(env.ASK_KV, started)) return fail(503, "paused", 900);

    // 2. Content type, size and Origin.
    if (!originAllowed(request, env.ASK_ALLOWED_ORIGINS)) return fail(403, "forbidden");
    if (!(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) return fail(415, "bad_request");
    const raw = await readCapped(request, MAX_BODY_BYTES);
    if (raw === null) return fail(413, "bad_request");
    const body = parseBody(raw);
    if (!body) return fail(400, "bad_request");

    // 2b. The knowledge pack (isolate memory when warm; never throws, the bundled fallback is the floor).
    const loaded = await source.load(env);
    const { pack, vocabulary } = loaded;

    // 3. Turnstile, or the signed 30-minute session cookie from an earlier check.
    const ip = request.headers.get("CF-Connecting-IP") ?? "";
    const visitor = await visitorHash(ip || "unknown", env.ASK_IP_SALT_SEED, started);
    const responseHeaders: Record<string, string> = {};
    if (turnstileOn(env) && !(await hasValidSession(request, env.ASK_COOKIE_KEY, visitor, started))) {
      const hostname = new URL(request.url).hostname;
      if (!(await verifyTurnstile(body.token, env.TURNSTILE_SECRET as string, ip, hostname, deps.fetcher))) {
        logEvent(env, loaded, { outcome: "rejected", locale: body.locale, source: "", reason: "turnstile", entry: body.entry, auto: body.auto, latencyMs: now() - started });
        return fail(403, "turnstile");
      }
      if (env.ASK_COOKIE_KEY) responseHeaders["Set-Cookie"] = await issueSession(env.ASK_COOKIE_KEY, visitor, started);
    }

    // 4. Rate limits per visitor.
    if (!(await minuteAllowed(visitor, started, env.ASK_RL))) return fail(429, "rate_limited", 60);
    if ((await visitorDayCount(env.ASK_KV, visitor, started)) >= PER_DAY) return fail(429, "rate_limited", secondsToMidnight(started));

    // 5. Normalization, PII scrub, length cap.
    const question = scrubPII(cleanText(body.q));
    if (!question || question.length > ASK_MAX_QUESTION) return fail(400, "bad_request");
    const locale = detectLocale(question, body.locale);
    const chip = chipFor(question, body.chip);
    const stats = (tags: readonly AskTag[]) => ({ topic: chip ? STATS_TOPIC_OF[chip.topic] : topicOfTags(tags), chip: chip?.id ?? "" });

    // 5b. Earlier turns: only the ones this server signed for this panel language and pack (a failed signature is dropped, never an error).
    const turnScope = { locale: body.locale, packVersion: pack.packVersion };
    const history = await verifyHistory(body.history, env.ASK_COOKIE_KEY, turnScope);
    // Signs a model answer so the client can send it back as history.
    const sign = async (text: string) => (env.ASK_COOKIE_KEY ? { sig: await signTurn(env.ASK_COOKIE_KEY, turnScope, { q: question, a: text }) } : {});

    // 6. Cache (answers that passed every check only). First turns only: a follow-up depends on its history.
    const key = await cacheKey(pack.packVersion, locale, question);
    try {
      const hit = history.length === 0 ? await env.ASK_KV?.get(key) : null;
      const cached = hit ? (JSON.parse(hit) as { text?: unknown; cite?: unknown }) : null;
      if (cached && typeof cached.text === "string") {
        const cachedText = normalizeDashes(cached.text);
        const resolved = resolveNickname(question);
        const tags = answerTags(retrieve(pack, resolved, locale).chunks);
        logEvent(env, loaded, { outcome: "answer", locale, source: "cache", entry: body.entry, auto: body.auto, ...stats(tags), latencyMs: now() - started });
        const cite = isAskCite(cached.cite) ? cached.cite : undefined;
        // Only model answers are cached, and the lead route is deterministic, so a cached answer to a lead question is a lead answer.
        const contact = isLeadQuestion(resolved) ? pack.contact : undefined;
        return streamResponse(cachedText, withTags({ done: true, outcome: "answer", source: "cache", asOf: pack.packDate, ...(cite ? { cite } : {}), ...(contact ? { contact } : {}), ...(await sign(cachedText)) }, tags), delay, responseHeaders);
      }
    } catch {
      // A broken cache entry is treated as a miss.
    }

    // 7. Global daily cap, then retrieval and the model call through AI Gateway (one fallback max).
    const cap = Number(env.ASK_DAILY_CAP) || DEFAULT_DAILY_CAP;
    if ((await globalDayCount(env.ASK_KV, started)) >= cap) return fail(503, "paused", secondsToMidnight(started));
    const metadata = { packVersion: pack.packVersion, promptVersion: PROMPT_VERSION, locale };
    const client = deps.client ? deps.client(env, metadata) : env.AI ? bindingClient(env.AI, env.ASK_GATEWAY_ID || undefined, metadata) : undefined;
    if (!client) return fail(503, "disabled");

    // 8. Output checks happen inside the pipeline.
    const backups = backupTiers(env, metadata, deps.groqFetch);
    const result = await runPipeline({
      question,
      locale,
      pack,
      vocabulary,
      client,
      models: { primary: env.ASK_PRIMARY || DEFAULT_PRIMARY, fallback: env.ASK_FALLBACK || DEFAULT_FALLBACK },
      history,
      backups,
      breaker: modelBreaker(env.ASK_KV),
    });

    // 9. Count, cache passing answers, log, stream.
    const background: Promise<unknown>[] = [];
    if (result.calledModel) {
      background.push(countModelCall(env.ASK_KV, visitor, started));
      const bad = result.reason === "model_failed" || (result.reason !== undefined && !EXPECTED_REASONS.has(result.reason));
      background.push(recordSample(env.ASK_KV, bad, started));
    }
    const modelAnswer = result.outcome === "answer" && !result.reason && (result.source === "primary" || result.source === "fallback" || result.source === "backup");
    if (modelAnswer && result.historyUsed === 0 && env.ASK_KV) {
      background.push(env.ASK_KV.put(key, JSON.stringify({ text: result.text, ...(result.cite ? { cite: result.cite } : {}) }), { expirationTtl: CACHE_TTL_SECONDS }).catch(() => {}));
    }
    if (background.length) context.waitUntil(Promise.all(background));
    logEvent(env, loaded, { outcome: result.outcome, locale, source: result.source, question, reason: result.reason ?? "", entry: body.entry, auto: body.auto, ...stats(result.tags), model: result.model, trail: result.failures.map((f) => `${f.model}:${f.reason}`).join(" > "), latencyMs: now() - started, historyUsed: result.historyUsed });
    const shareable = result.outcome === "answer" || result.outcome === "unknown";
    const tags = shareable ? result.tags : [];
    const cite = shareable ? result.cite : undefined;
    // Lead intent: the contact card values come from the dataset (the pack), never from the model.
    const contact = result.lead && shareable ? pack.contact : undefined;
    const signature = modelAnswer ? await sign(result.text) : {};
    return streamResponse(result.text, withTags({ done: true, outcome: result.outcome, source: result.source, asOf: pack.packDate, ...(cite ? { cite } : {}), ...(contact ? { contact } : {}), ...signature }, tags), delay, responseHeaders);
  }

  return async function onRequest(context: PagesContext): Promise<Response> {
    const method = context.request.method;
    if (method === "GET" || method === "HEAD") {
      try {
        return await status(context.env);
      } catch {
        return fail(503, "paused");
      }
    }
    if (method === "POST") {
      try {
        return await post(context);
      } catch {
        return fail(503, "paused");
      }
    }
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD, POST", ...SECURITY_HEADERS } });
  };
}
