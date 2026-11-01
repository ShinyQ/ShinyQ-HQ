import { ASK_MAX_QUESTION, isAskEntry, type AskTurn, type AskEntry, type AskError, type AskErrorCode, type AskFrame, type AskLocale, type AskOutcome, type AskSource, type AskStatus, type AskTag } from "../../src/ask/protocol";
import { STATS_TOPIC_OF } from "../../src/ask/suggestions";
import { kvAnswerCache } from "./answer-cache";
import { backupTiers } from "./groq";
import { parseHistory, signTurn, verifyHistory } from "./history";
import { breakerOpen, countModelCall, DEFAULT_DAILY_CAP, globalDayCount, minuteAllowed, modelBreaker, PER_DAY, recordSample, secondsToMidnight, visitorDayCount } from "./limits";
import { bindingClient, DEFAULT_FALLBACK, DEFAULT_PRIMARY, type ModelClient } from "./model";
import { scrubPII } from "./pii";
import { bindingEmbedder, type Embedder } from "./vectors";
import type { LoadedPack, PackSource } from "./pack-source";
import { runPipeline, type PipelineReason } from "./pipeline";
import { PROMPT_VERSION } from "./prompt";
import { chipFor, topicOfTags } from "./askStats";
import { hasValidSession, issueSession, originAllowed, readCapped, verifyTurnstile, visitorHash, type Fetcher } from "./security";
import { cleanText, detectLocale } from "./text";
import type { AskEnv, PagesContext } from "./types";
import type { StatsTopic } from "../../src/lib/stats/protocol";

/**
 * Outcomes that never count against the circuit breaker: expected declines, and grounding checks a visitor can invite
 * with an ordinary question (an outside name, a calculated number, a code request). Counting those let one visitor
 * pause Ask for everyone (security audit 2026-10-24). Upstream failures, empty answers and the safety blocks
 * (forbidden, secret, leak, roleplay) still count.
 */
export const EXPECTED_REASONS: ReadonlySet<string> = new Set([
  "harmful", "private", "others", "general", "persona", "injection", "offtopic", "unsourced", "model_decline", "fit", "consulting",
  "numeric", "entity", "employer", "code", "defamation", "personal-data",
]);

/** Request pipeline in the security order of spec 7.4. */

/** The question plus up to 5 signed earlier turns (multi-turn memory, owner decisions 2026-10-17 and 2026-10-24). */
export const MAX_BODY_BYTES = 12288;
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
  /** Question embedder override (tests); default `bindingEmbedder(env.AI)`. */
  embed?: (env: AskEnv) => Embedder;
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
  /** Route label (blob14): civic, policy, lifestyle, mentoring, team, adjacent, lead or default, plus "+partial"; "" for a canned reply. */
  route?: string;
  /** Retrieval that built the context (blob15): bm25 or hybrid; "" when nothing was retrieved. */
  retrieval?: string;
  /** A declined question with a strong retrieval match (blob16 "match"): the over-refusal count of the content-gap report. */
  strongMatch?: boolean;
  /** Names that failed the entity or employer check (blob17, `checkedNames`), or "". */
  checked?: string;
}

/** Longest blob17 value: a few names, enough to trace an entity miss. */
export const CHECKED_NAMES_MAX = 120;

/**
 * The names an answer failed the entity or employer check on (owner decision 2026-11-01: an "entity" miss was
 * untraceable), for blob17. Model output only: a name that shares a word with the visitor's question is dropped, so
 * nothing the visitor typed is logged; comma joined, cut at CHECKED_NAMES_MAX.
 */
export function checkedNames(reason: string | undefined, detail: readonly string[] | undefined, question: string): string {
  if ((reason !== "entity" && reason !== "employer") || !detail?.length) return "";
  const asked = new Set(question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const own = detail.filter((name) => !(name.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).some((word) => asked.has(word)));
  return [...new Set(own)].join(",").slice(0, CHECKED_NAMES_MAX);
}

/** Outcomes whose scrubbed question is logged (owner decision 2026-10-24: unanswered and declined, so over-refusals show). */
const LOGGED_QUESTION: ReadonlySet<string> = new Set(["unknown", "decline"]);

/**
 * Anonymized event (no IP, no raw question). Only unanswered and declined questions keep their scrubbed text
 * (content gaps and over-refusals, owner decision 2026-10-24). Blobs: outcome, locale, model source, gap question, pack version, reason, entry point,
 * topic, chip id (these two feed the public visit stats), answering model id (blob10), failure trail
 * `model:reason > model:reason` cut at 200 characters (blob11), pack tier that served (blob12: memory, kv, pin,
 * fallback), "auto" when the client reported an automated browser (blob13, counting only, else ""), the route (blob14), the
 * retrieval (blob15: bm25 or hybrid), "match" for a declined question retrieval would have answered (blob16) and the names
 * an answer failed the entity or employer check on (blob17, `checkedNames`). Appended so older queries keep working. Doubles: latency, count, earlier turns sent to the model.
 */
function logEvent(env: AskEnv, loaded: LoadedPack, e: EventData) {
  try {
    env.ASK_EVENTS?.writeDataPoint({
      blobs: [e.outcome, e.locale, e.source, LOGGED_QUESTION.has(e.outcome) ? (e.question ?? "").slice(0, 300) : "", loaded.pack.packVersion, e.reason ?? "", e.entry, e.topic ?? "", e.chip ?? "", e.model ?? "", (e.trail ?? "").slice(0, 200), loaded.tier, e.auto ? "auto" : "", e.route ?? "", e.retrieval ?? "", e.strongMatch ? "match" : "", e.checked ?? ""],
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

    // 6. Global daily cap (cache hits included), then routing, retrieval, the answer cache and the model chain.
    const cap = Number(env.ASK_DAILY_CAP) || DEFAULT_DAILY_CAP;
    if ((await globalDayCount(env.ASK_KV, started)) >= cap) return fail(503, "paused", secondsToMidnight(started));
    const metadata = { packVersion: pack.packVersion, promptVersion: PROMPT_VERSION, locale };
    const client = deps.client ? deps.client(env, metadata) : env.AI ? bindingClient(env.AI, env.ASK_GATEWAY_ID || undefined, metadata) : undefined;
    if (!client) return fail(503, "disabled");

    // 7. The answer cache (first turns only) and the output checks happen inside the pipeline; KV writes run after the response.
    const backups = backupTiers(env, metadata, deps.groqFetch);
    const background: Promise<unknown>[] = [];
    const cache = env.ASK_KV ? kvAnswerCache(env.ASK_KV, (pending) => background.push(pending)) : undefined;
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
      // Hybrid retrieval (owner decision 2026-10-24): one bge-m3 call, 300 ms at most, else BM25 alone.
      ...(env.AI ? { embed: deps.embed ? deps.embed(env) : bindingEmbedder(env.AI) } : {}),
      ...(cache ? { cache } : {}),
    });

    // 8. Count model calls (never a cache hit), log, stream.
    if (result.calledModel) {
      background.push(countModelCall(env.ASK_KV, visitor, started));
      const bad = result.reason === "model_failed" || (result.reason !== undefined && !EXPECTED_REASONS.has(result.reason));
      background.push(recordSample(env.ASK_KV, bad, started));
    }
    // A model answer that passed every check, fresh or from the cache, is signed for multi-turn memory.
    const signable = result.outcome === "answer" && !result.reason && (result.source === "primary" || result.source === "fallback" || result.source === "backup" || result.source === "cache");
    if (background.length) context.waitUntil(Promise.all(background));
    logEvent(env, loaded, { outcome: result.outcome, locale, source: result.source, question, reason: result.reason ?? "", entry: body.entry, auto: body.auto, ...stats(result.tags), model: result.model, trail: result.failures.map((f) => `${f.model}:${f.reason}`).join(" > "), latencyMs: now() - started, historyUsed: result.historyUsed, route: result.route, retrieval: result.retrieval, strongMatch: result.strongMatch, checked: checkedNames(result.reason, result.detail, question) });
    const shareable = result.outcome === "answer" || result.outcome === "unknown";
    // A decline carries the topics Rover can talk about instead (owner decision 2026-10-24: never a dead end).
    const tags = shareable || result.outcome === "decline" ? result.tags : [];
    const cite = shareable ? result.cite : undefined;
    const cites = shareable && result.cites ? result.cites : undefined;
    // Lead intent: the contact card values come from the dataset (the pack), never from the model.
    const contact = result.lead && shareable ? pack.contact : undefined;
    const signature = signable ? await sign(result.text) : {};
    return streamResponse(result.text, withTags({ done: true, outcome: result.outcome, source: result.source, asOf: pack.packDate, ...(cite ? { cite } : {}), ...(cites ? { cites } : {}), ...(contact ? { contact } : {}), ...signature }, tags), delay, responseHeaders);
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
