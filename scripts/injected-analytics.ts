/**
 * Detects a Web Analytics beacon that Cloudflare injected into production HTML (Pages "Web Analytics"
 * in the project's Metrics tab, or a zone automatic setup). The site loads its own beacon from an inline
 * guard (src/components/Analytics.tsx) that honors "Don't count my visits"; only one beacon per page
 * reports, so an injected one steals every page load from the site that hq-stats reads and ignores the
 * opt-out (incident 2026-10-15/16, docs/deploy.md section 13). Pure; used by deploy-smoke.ts and uptime.ts.
 */

/** Parser-inserted beacon tags and the comments Cloudflare wraps them in; the site's own beacon is created by script. */
const INJECTED = [/<!--\s*Cloudflare (?:Pages|Web) Analytics\s*-->/i, /<script\b[^>]*\sdata-cf-beacon\s*=/i];

/** A short description of the injected beacon, or null when the page carries none. */
export function injectedAnalytics(html: string): string | null {
  return INJECTED.some((re) => re.test(html)) ? "a Cloudflare-injected Web Analytics beacon (turn off Web Analytics in the Pages project's Metrics tab)" : null;
}
