/** Knowledge pack and Function environment types. Kept free of Cloudflare type packages on purpose (T12). */

import type { AskContact } from "../../src/ask/protocol";

export type ChunkType =
  | "profile"
  | "now"
  | "stats"
  | "skills"
  | "certifications"
  | "awards"
  | "career"
  | "education"
  | "project"
  | "post"
  | "publication"
  | "talk"
  | "contact"
  | "side-project"
  | "repo"
  | "live-stats"
  | "principle"
  | "perspective"
  | "production"
  | "site";

export interface KnowledgeChunk {
  id: string;
  type: ChunkType;
  title: string;
  text_en: string;
  text_id: string;
  /** YYYY-MM or YYYY-MM-DD of the fact, when known. */
  updatedAt?: string;
  /** Page View path without the locale prefix, e.g. "/labs/voice-ai-contact-center"; the `site` chunk holds `/build`. */
  url?: string;
  keywords: string[];
}

export interface KnowledgePack {
  packVersion: string;
  /** Date the pack is accurate as of (YYYY-MM-DD): the newest of the content and live-facts dates. */
  packDate: string;
  chunks: KnowledgeChunk[];
  /** Names the answer may use as employers or clients (T3): employers, freelance clients, products. */
  entities: string[];
  /** Employers, schools and freelance clients (never products): opinion questions that name one are declined (spec section 13). */
  orgs: string[];
  /** Email and LinkedIn from the dataset (`roof.contact`): the contact card of lead-intent answers (the `done` frame). */
  contact: AskContact;
}

/** Output safety data compiled at build time from the public-safety blocklist (includes private terms; never public). */
export interface SafetyData {
  /** Plain terms (case-insensitive, word boundaries) and /regex/ terms (case-sensitive), as in content/safety-blocklist*.txt. */
  blocklist: string[];
}

export interface AiBinding {
  run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  /** AI Gateway handle; `getUrl("groq")` is the gateway base URL of a third-party provider. */
  gateway?(id: string): { getUrl(provider?: string): Promise<string> };
}

export interface KvNamespace {
  /** `cacheTtl` (seconds, at least 30) keeps the value cached at the reading location. */
  get(key: string, options?: { cacheTtl?: number }): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface AnalyticsEngineDataset {
  writeDataPoint(point: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface AskEnv {
  ASK_ENABLED?: string;
  ASK_PRIMARY?: string;
  ASK_FALLBACK?: string;
  ASK_GATEWAY_ID?: string;
  /** Groq API key (Pages secret). Unset means the Groq backup tiers are skipped. */
  GROQ_API_KEY?: string;
  /** Comma list of Groq model ids, tried in order after Workers AI; empty means the defaults. */
  ASK_BACKUP_MODELS?: string;
  ASK_ALLOWED_ORIGINS?: string;
  ASK_DAILY_CAP?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  ASK_IP_SALT_SEED?: string;
  ASK_COOKIE_KEY?: string;
  AI?: AiBinding;
  ASK_KV?: KvNamespace;
  ASK_EVENTS?: AnalyticsEngineDataset;
  ASK_RL?: RateLimitBinding;
}

/** Bindings of the performance beacon Function (functions/api/rum.ts, appendix 06 section 4). */
export interface RumEnv {
  /** Kill switch: anything but "true" drops every point (still 204, so clients never retry). */
  RUM_ENABLED?: string;
  /** Site origins, shared with Ask the HQ. */
  ASK_ALLOWED_ORIGINS?: string;
  PERF_EVENTS?: AnalyticsEngineDataset;
}

/** Bindings of the visit beacon Function (functions/api/visit.ts, appendix 06 section 4). */
export interface VisitEnv {
  /** Kill switch of the public visit stats: anything but "true" drops every point (still 204). */
  STATS_ENABLED?: string;
  /** Site origins, shared with Ask the HQ. */
  ASK_ALLOWED_ORIGINS?: string;
  VISIT_EVENTS?: AnalyticsEngineDataset;
}

/** Bindings of the public stats Function (functions/api/stats.ts). */
export interface StatsEnv {
  /** Kill switch: anything but "true" answers 204, so every stats view hides. */
  STATS_ENABLED?: string;
  /** KV namespace written by the hq-stats Cron Worker (workers/stats/), read only here. */
  STATS_KV?: KvNamespace;
}

/** A service binding to another Worker (the Agent Office: hq-office). */
export interface ServiceBinding {
  fetch(input: string | Request, init?: RequestInit): Promise<Response>;
}

/** The Cache API's default cache as Pages Functions see it (`caches.default`, per data center). */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/** Agent Office routes (docs/agents/office.md). */
export interface OfficeEnv {
  /** Kill switch: anything but "true" answers `{v:1, enabled:false}` and drops beats and webhooks. */
  OFFICE_ENABLED?: string;
  /** Service binding to the hq-office Worker. */
  OFFICE?: ServiceBinding;
}

/** Byte range of an R2 read (the subset of the Workers R2 API the guides Function uses). */
export interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}

export interface R2ObjectBody {
  size: number;
  httpEtag: string;
  body: ReadableStream;
  range?: R2Range;
}

export interface R2ObjectHead {
  size: number;
  httpEtag: string;
}

export interface R2Bucket {
  head(key: string): Promise<R2ObjectHead | null>;
  get(key: string, options?: { range?: R2Range }): Promise<R2ObjectBody | null>;
}

/** Bindings of the study guides Function (functions/api/guides/[slug].ts). */
export interface GuidesEnv {
  /** R2 bucket hq-study-guides: keys `<slug>/<version>.pdf`. */
  GUIDES?: R2Bucket;
}

export interface PagesContext<E = AskEnv> {
  request: Request;
  env: E;
  waitUntil(promise: Promise<unknown>): void;
}
