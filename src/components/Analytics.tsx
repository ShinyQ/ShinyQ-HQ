import { CF_BEACON_TOKEN } from "@/lib/site";
import { STATS_OPTOUT_KEY, STATS_OPTOUT_VALUE } from "@/lib/stats/optout";

const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";

/** Longest wait for the app chunks after `load` before the beacon loads anyway. */
export const CHUNK_WAIT_MS = 3000;

/**
 * Inline guard that loads the Cloudflare beacon once the page is done with its own work, unless the visitor
 * chose "Don't count my visits" (`localStorage["hq:stats-optout"] === "1"`, src/lib/stats/optout.ts, read at
 * inject time). The beacon used to start during parse, before the app chunks. Order now:
 * 1. the `load` event;
 * 2. the app chunks: the paint-gated loader of scripts/defer-scripts.ts inserts them after the first paint,
 *    often after `load`, so it waits for at least one `/_next/static/chunks/` script and a Resource Timing
 *    entry for each (except the `nomodule` polyfills modern browsers never fetch), at most `CHUNK_WAIT_MS`;
 * 3. idle: `requestIdleCallback` with a 2 s deadline, else `setTimeout`.
 * No page view is lost except a visit that leaves before then: the beacon sends the page load at once when
 * `document.readyState` is "complete" (it reads the Navigation Timing entry), and `spa: true` still records
 * later History navigations. The code must never contain the defer loader's marker attribute name
 * (scripts/defer-scripts.ts skips a page that already carries it). The page's script policy covers both
 * (scripts/csp-hashes.ts adds this loader's sha256 at build time, the beacon host is in script-src). The token
 * is alphanumeric (`resolveBeaconToken`), so it cannot break out of the string.
 */
export function cfBeaconScript(token: string): string {
  const config = JSON.stringify(JSON.stringify({ token, spa: true }));
  const inject = `if(d)return;d=1;try{if(localStorage.getItem(${JSON.stringify(STATS_OPTOUT_KEY)})===${JSON.stringify(STATS_OPTOUT_VALUE)})return}catch(e){}var s=document.createElement("script");s.defer=true;s.src=${JSON.stringify(BEACON_SRC)};s.setAttribute("data-cf-beacon",${config});document.body.appendChild(s)`;
  const chunksDone =
    `function done(){var c=document.querySelectorAll('script[src*="/_next/static/chunks/"]:not([nomodule])');` +
    `if(!c.length)return false;` +
    `for(var i=0;i<c.length;i++)if(!performance.getEntriesByName(c[i].src).length)return false;return true}`;
  const wait =
    `function wait(){var o,t=setTimeout(fin,${CHUNK_WAIT_MS});function fin(){clearTimeout(t);if(o)o.disconnect();idle()}` +
    `function check(){if(done())fin()}try{o=new PerformanceObserver(check);o.observe({type:"resource"})}catch(e){}check()}`;
  return (
    `(function(){var d=0;function go(){${inject}}` +
    `function idle(){if(window.requestIdleCallback)requestIdleCallback(go,{timeout:2000});else setTimeout(go,0)}` +
    chunksDone +
    wait +
    `if(document.readyState==="complete")wait();else addEventListener("load",wait,{once:true})})()`
  );
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
