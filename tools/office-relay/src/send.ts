import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import type { RelayConfig } from "./store";

export const KEYCHAIN_SERVICE = "hq-office-ingest";
export const KEYCHAIN_ACCOUNT = "office-relay";
const LOCAL_TEST_ENDPOINT = /^http:\/\/127\.0\.0\.1:\d{2,5}\//;

/** `X-Office-Signature` value: HMAC-SHA256 of the exact body, lowercase hex (checked by workers/office/src/crypto.ts). */
export function signBody(body: string, key: string): string {
  return `sha256=${createHmac("sha256", key).update(body).digest("hex")}`;
}

/** The ingest key from the macOS Keychain (OFFICE_RELAY_KEY overrides it for tests), or null. */
export function readIngestKey(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.OFFICE_RELAY_KEY) return env.OFFICE_RELAY_KEY;
  if (process.platform !== "darwin") return null;
  const r = spawnSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"], { encoding: "utf8", timeout: 1500 });
  const key = r.status === 0 ? String(r.stdout).trim() : "";
  return key || null;
}

/** The configured https endpoint; tests may point it at 127.0.0.1 only. */
export function endpointOf(config: RelayConfig, env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OFFICE_RELAY_ENDPOINT;
  return override && LOCAL_TEST_ENDPOINT.test(override) ? override : config.endpoint;
}

/** Posts one beat with a 2 s timeout; the HTTP status, or 0 on any error. */
export async function postBeat(body: string, opts: { endpoint: string; key: string; timeoutMs?: number }): Promise<number> {
  try {
    const res = await fetch(opts.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Office-Signature": signBody(body, opts.key) },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 2000),
    });
    return res.status;
  } catch {
    return 0;
  }
}
