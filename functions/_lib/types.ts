/** Knowledge pack and Function environment types. Kept free of Cloudflare type packages on purpose (T12). */

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
  | "perspective";

export interface KnowledgeChunk {
  id: string;
  type: ChunkType;
  title: string;
  text_en: string;
  text_id: string;
  /** YYYY-MM or YYYY-MM-DD of the fact, when known. */
  updatedAt?: string;
  /** Page View path without the locale prefix, e.g. "/labs/voice-ai-contact-center". */
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
}

/** Output safety data compiled at build time from the public-safety blocklist (includes private terms; never public). */
export interface SafetyData {
  /** Plain terms (case-insensitive, word boundaries) and /regex/ terms (case-sensitive), as in content/safety-blocklist*.txt. */
  blocklist: string[];
}

export interface AiBinding {
  run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

export interface KvNamespace {
  get(key: string): Promise<string | null>;
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

export interface PagesContext {
  request: Request;
  env: AskEnv;
  waitUntil(promise: Promise<unknown>): void;
}
