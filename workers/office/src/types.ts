/**
 * Bindings and secrets of the hq-office Worker, hand-written like functions/_lib/types.ts (no Cloudflare type
 * packages on purpose, T12): only the members this Worker uses.
 */
export interface DurableObjectStubLike {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

/** The Durable Object's state: its storage API (backed by SQLite on the free plan). */
export interface DurableObjectStateLike {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
  };
}

export interface OfficeWorkerEnv {
  OFFICE_DO: DurableObjectNamespaceLike;
  /** Secret: HMAC key of relay beats (X-Office-Signature). */
  OFFICE_INGEST_KEY?: string;
  /** Secret: GitHub webhook secret (X-Hub-Signature-256). */
  GITHUB_WEBHOOK_SECRET?: string;
  /** Comma-separated `owner/*` or `owner/name` entries (wrangler.toml [vars]). */
  OFFICE_REPO_ALLOWLIST?: string;
  /** Comma-separated GitHub logins whose same-repository pull requests may show (wrangler.toml [vars]; default ShinyQ,Copilot). */
  OFFICE_GITHUB_ACTORS?: string;
}
