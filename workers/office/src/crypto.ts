import { timingSafeEqual } from "../../../functions/_lib/security";

/** HMAC-SHA256 of `message` keyed with `secret`, lowercase hex (the GitHub and relay signature format). */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time check of a `sha256=<hex>` header (X-Office-Signature, X-Hub-Signature-256) over the raw body. */
export async function signatureOk(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  return timingSafeEqual(header.slice("sha256=".length).toLowerCase(), await hmacHex(secret, body));
}
