/**
 * Public live links for L3 pods (`Pod.liveUrl`, R4-J). Only these hosts may ever be linked: public
 * sites the owner asked to show. Internal apps (admin dashboards, client portals, internal assistants)
 * must never get a link, so adding a host here is an owner decision made in review, never a content
 * edit. Pure and dependency-free: the schema, the safety lint, the selectors and the 3D chunk share it.
 */
export const PUBLIC_LIVE_HOSTS: readonly string[] = ["mii-microsoft.azurewebsites.net", "mii-microsoft-ai.azurewebsites.net"];

/** Why `url` cannot be a pod's live link, or null when it can: https, an allowlisted host, the site root only. */
export function liveUrlProblem(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Live link must be an absolute URL";
  }
  if (parsed.protocol !== "https:") return "Live link must use https";
  if (parsed.username || parsed.password || parsed.port) return "Live link must not carry credentials or a port";
  if (!PUBLIC_LIVE_HOSTS.includes(parsed.hostname)) {
    return `Live link host "${parsed.hostname}" is not in PUBLIC_LIVE_HOSTS (src/content/live-links.ts)`;
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) return "Live link must point to the site root (no path, query or hash)";
  return null;
}

/**
 * The public hosts and their App Service names ("mii-microsoft"). `loadBlocklist` drops a private term
 * equal to one of them, so the public links pass the lint while every other resource name stays blocked.
 * Kept out of `content/safety-allowlist.txt` on purpose: that file also feeds the Ask entity allowlist,
 * where "mii-microsoft" would make "worked at Microsoft" look like a known employer.
 */
export const PUBLIC_LIVE_NAMES: readonly string[] = PUBLIC_LIVE_HOSTS.flatMap((host) => [host, host.split(".")[0]]);

export function isPublicLiveUrl(url: string): boolean {
  return liveUrlProblem(url) === null;
}
