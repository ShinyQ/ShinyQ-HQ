import { CF_BEACON_TOKEN } from "@/lib/site";
import { STATS_OPTOUT_KEY, STATS_OPTOUT_VALUE } from "@/lib/stats/optout";

const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";

/**
 * Inline guard that loads the Cloudflare beacon unless the visitor chose "Don't count my visits"
 * (`localStorage["hq:stats-optout"] === "1"`, src/lib/stats/optout.ts). Runs where the tag used to be, so
 * the beacon still loads during page parse; the page's script policy covers both (scripts/csp-hashes.ts
 * adds this loader's sha256 at build time, the beacon host is in script-src). The token is alphanumeric
 * (`resolveBeaconToken`), so it cannot break out of the string.
 */
export function cfBeaconScript(token: string): string {
  const config = JSON.stringify(JSON.stringify({ token, spa: true }));
  return `(function(){try{if(localStorage.getItem(${JSON.stringify(STATS_OPTOUT_KEY)})===${JSON.stringify(STATS_OPTOUT_VALUE)})return}catch(e){}var s=document.createElement("script");s.defer=true;s.src=${JSON.stringify(BEACON_SRC)};s.setAttribute("data-cf-beacon",${config});document.body.appendChild(s)})()`;
}

/**
 * Cloudflare Web Analytics beacon (cookieless, no consent banner needed), behind the opt-out guard.
 * Rendered only when NEXT_PUBLIC_CF_BEACON_TOKEN is set at build time.
 * `spa: true` records History API navigations, so room URLs count as views.
 */
export function Analytics({ token = CF_BEACON_TOKEN }: { token?: string }) {
  if (!token) return null;
  return <script id="hq-cf-beacon" dangerouslySetInnerHTML={{ __html: cfBeaconScript(token) }} />;
}
