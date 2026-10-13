import type { RoomId } from "@/content/schema";

/**
 * Tech Reactor deep link (`/{locale}/labs#labs-tech=<slug>`). No imports beyond types: the gate reads
 * the hash in the main bundle (`gateStartRoom`), so this file stays tiny.
 */
export const REACTOR_ROOM: RoomId = "L3:reactor";
export const TECH_HASH = "labs-tech";
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The tech slug of a `#labs-tech=<slug>` hash; null for anything else. */
export function techFromHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "");
  const prefix = `${TECH_HASH}=`;
  if (!raw.startsWith(prefix)) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(raw.slice(prefix.length));
  } catch {
    return null;
  }
  return SLUG.test(slug) ? slug : null;
}

/** `#labs-tech=<slug>`, or "" for no pick. */
export function techHash(slug: string | null): string {
  return slug ? `#${TECH_HASH}=${slug}` : "";
}
