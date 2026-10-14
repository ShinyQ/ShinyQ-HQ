import type { RoomId } from "@/content/schema";
import { filterFromHash, filterHash } from "../filterHash";

/**
 * L4 Topic Constellation deep link (`/{locale}/library#library-topic=<slug>`). Imports only the tiny
 * `filterHash`: the gate reads the hash in the main bundle (`gateStartRoom`), so this file stays tiny.
 */
export const TOPICS_ROOM: RoomId = "L4:topics";
export const TOPIC_HASH = "library-topic";

/** The topic slug of a `#library-topic=<slug>` hash; null for anything else. */
export function topicFromHash(hash: string): string | null {
  return filterFromHash(hash, TOPIC_HASH);
}

/** `#library-topic=<slug>`, or "" for no pick. */
export function topicHash(slug: string | null): string {
  return filterHash(TOPIC_HASH, slug);
}
