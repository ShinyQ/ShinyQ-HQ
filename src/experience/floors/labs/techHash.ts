import type { RoomId } from "@/content/schema";
import { filterFromHash, filterHash } from "../filterHash";

/**
 * Tech Reactor deep link (`/{locale}/labs#labs-tech=<slug>`). Imports only the tiny `filterHash`: the
 * gate reads the hash in the main bundle (`gateStartRoom`), so this file stays tiny.
 */
export const REACTOR_ROOM: RoomId = "L3:reactor";
export const TECH_HASH = "labs-tech";
/** The tech slug of a `#labs-tech=<slug>` hash; null for anything else. */
export function techFromHash(hash: string): string | null {
  return filterFromHash(hash, TECH_HASH);
}

/** `#labs-tech=<slug>`, or "" for no pick. */
export function techHash(slug: string | null): string {
  return filterHash(TECH_HASH, slug);
}
