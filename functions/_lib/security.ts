/** Request guards: Origin (T7), Turnstile (T8), signed session cookie, salted visitor hash (T8, T10). */

const encoder = new TextEncoder();

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hmac(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** UTC day, used to rotate the visitor hash and to key the daily counters. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Salted, daily-rotating hash of the client IP. The raw IP is never stored or logged. */
export async function visitorHash(ip: string, seed: string | undefined, now: number): Promise<string> {
  return (await sha256Hex(`${seed ?? "unsalted"}|${utcDay(now)}|${ip}`)).slice(0, 24);
}

/**
 * Same-origin only: the browser's Origin must equal the request origin, and match the configured
 * allowlist (exact origins or `https://*.example.dev` single-label wildcards) when one is set.
 */
export function originAllowed(request: Request, allowList: string | undefined): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin") return false;
  const own = new URL(request.url).origin;
  if (origin !== own) return false;
  const entries = (allowList ?? "")
    .split(",")
    .map((e) => e.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (entries.length === 0) return true;
  return entries.some((entry) => {
    if (!entry.includes("*.")) return entry === origin;
    const [scheme, host] = entry.split("://*.");
    const url = new URL(origin);
    if (`${url.protocol.replace(":", "")}` !== scheme) return false;
    const suffix = `.${host}`;
    return url.host.endsWith(suffix) && !url.host.slice(0, -suffix.length).includes(".");
  });
}

/**
 * Reads at most `limit` bytes of a request body; null when it is larger, declared or not. Streams the
 * body and stops at the cap, so a client that omits Content-Length cannot make a handler buffer more
 * (`/api/ask`, and the `/api/rum` and `/api/visit` beacons, security S7).
 */
export async function readCapped(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export const SESSION_COOKIE = "hq_ask";
export const SESSION_SECONDS = 30 * 60;

/** Signed session value: `v1.<expiry>.<hmac(expiry, visitor)>`. Bound to the visitor hash. */
export async function issueSession(key: string, visitor: string, now: number): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_SECONDS;
  const value = `v1.${exp}.${await hmac(key, `v1.${exp}.${visitor}`)}`;
  return `${SESSION_COOKIE}=${value}; Max-Age=${SESSION_SECONDS}; Path=/api/ask; HttpOnly; Secure; SameSite=Strict`;
}

export async function hasValidSession(request: Request, key: string | undefined, visitor: string, now: number): Promise<boolean> {
  if (!key) return false;
  const cookie = request.headers.get("Cookie") ?? "";
  const raw = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const match = raw?.match(/^v1\.(\d{1,12})\.([A-Za-z0-9_-]{20,})$/);
  if (!match) return false;
  const exp = Number(match[1]);
  if (exp * 1000 <= now || exp * 1000 > now + SESSION_SECONDS * 1000 + 60_000) return false;
  return timingSafeEqual(match[2], await hmac(key, `v1.${exp}.${visitor}`));
}

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Server-side Turnstile check. The token must be valid and issued for the request's hostname. */
export async function verifyTurnstile(
  token: string | undefined,
  secret: string,
  ip: string,
  hostname: string,
  fetcher: Fetcher = (input, init) => fetch(input, init),
): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const response = await fetcher(TURNSTILE_VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(4000) });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean; hostname?: string };
    return result.success === true && (!result.hostname || result.hostname === hostname);
  } catch {
    return false;
  }
}
