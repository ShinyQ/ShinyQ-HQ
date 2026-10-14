/**
 * Floor filter deep links (`#<key>=<slug>`): the L3 Tech Reactor (`#labs-tech=`) and the L4 Topic
 * Constellation (`#library-topic=`). No imports: the gate reads these hashes in the main bundle.
 */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The slug of a `#<key>=<slug>` hash; null for anything else. */
export function filterFromHash(hash: string, key: string): string | null {
  const raw = hash.replace(/^#/, "");
  const prefix = `${key}=`;
  if (!raw.startsWith(prefix)) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(raw.slice(prefix.length));
  } catch {
    return null;
  }
  return SLUG.test(slug) ? slug : null;
}

/** `#<key>=<slug>`, or "" for no pick. */
export function filterHash(key: string, slug: string | null): string {
  return slug ? `#${key}=${slug}` : "";
}
