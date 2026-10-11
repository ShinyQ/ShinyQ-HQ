/**
 * Ask the HQ availability: `GET /api/ask` once per page load. Split from ./client (Turnstile, SSE,
 * the answer stream) because the dock launcher, the hero bar and the Rover Terminal import it on
 * every page, and the rest of the client only loads with the chat panel.
 */
import type { AskStatus } from "./protocol";

export const ASK_ENDPOINT = "/api/ask";

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

let statusPromise: Promise<AskStatus | null> | null = null;
let statusValue: AskStatus | null | undefined;

function isStatus(value: unknown): value is AskStatus {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.enabled === "boolean" &&
    (v.turnstileSiteKey === null || typeof v.turnstileSiteKey === "string") &&
    typeof v.asOf === "string" &&
    typeof v.maxLength === "number"
  );
}

/**
 * `GET /api/ask`, once per page load (the promise is cached). Resolves `null` when the feature is
 * unavailable: 503, 404 (no Functions, e.g. `bun run serve`), a network error or a bad body.
 */
export function fetchAskStatus(fetchImpl: FetchFn = (input, init) => fetch(input, init)): Promise<AskStatus | null> {
  statusPromise ??= (async () => {
    try {
      const response = await fetchImpl(ASK_ENDPOINT, { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      return isStatus(body) ? body : null;
    } catch {
      return null;
    }
  })().then((status) => {
    statusValue = status;
    return status;
  });
  return statusPromise;
}

/** The status if it already resolved: `undefined` while unknown, `null` when unavailable. */
export function peekAskStatus(): AskStatus | null | undefined {
  return statusValue;
}

export const isAskEnabled = (status: AskStatus | null | undefined): status is AskStatus => Boolean(status?.enabled);

/** Test hook (via resetAskClient): forgets the cached status. */
export function resetAskStatus() {
  statusPromise = null;
  statusValue = undefined;
}
