import { CF_BEACON_TOKEN } from "@/lib/site";

const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";

/** Longest wait after `load` for the deferred app chunk scripts to be inserted before the beacon loads anyway. */
export const CHUNK_WAIT_MS = 1000;
/** `requestIdleCallback` deadline once the chunks were requested. */
export const IDLE_TIMEOUT_MS = 500;

/**
 * Inline guard that loads the Cloudflare beacon after the page's own requests, unless the browser is automated
 * (`navigator.webdriver`: Playwright, Lighthouse, headless checks, read at inject time), so automation never
 * counts as a visit. The beacon used to start during parse, before the app chunks. Order now:
 * 1. the `load` event;
 * 2. the app chunk requests: the paint-gated loader of scripts/defer-scripts.ts inserts every chunk script in
 *    one loop after the first paint, often after `load`, so one `/_next/static/chunks/` script in the DOM
 *    (`nomodule` polyfills excluded, modern browsers never fetch them) means all were requested. A
 *    MutationObserver watches for it, at most `CHUNK_WAIT_MS` after `load`;
 * 3. idle: `requestIdleCallback` with an `IDLE_TIMEOUT_MS` deadline, else `setTimeout`.
 * No page view is lost except a visit that leaves before then: the beacon sends the page load at once when
 * `document.readyState` is "complete" (it reads the Navigation Timing entry), and `spa: true` still records
 * later History navigations. The code must never contain the defer loader's marker attribute name
 * (scripts/defer-scripts.ts skips a page that already carries it). The page's script policy covers both
 * (scripts/csp-hashes.ts adds this loader's sha256 at build time, the beacon host is in script-src). The token
 * is alphanumeric (`resolveBeaconToken`), so it cannot break out of the string.
 */
export function cfBeaconScript(token: string): string {
  const config = JSON.stringify(JSON.stringify({ token, spa: true }));
  const inject = `if(d)return;d=1;if(navigator.webdriver)return;var s=document.createElement("script");s.defer=true;s.src=${JSON.stringify(BEACON_SRC)};s.setAttribute("data-cf-beacon",${config});document.body.appendChild(s)`;
  const wait =
    `function wait(){var o,f=0,t=setTimeout(fin,${CHUNK_WAIT_MS});` +
    `function fin(){if(f)return;f=1;clearTimeout(t);if(o)o.disconnect();idle()}` +
    `function check(){if(document.querySelector('script[src*="/_next/static/chunks/"]:not([nomodule])'))fin()}` +
    `try{o=new MutationObserver(check);o.observe(document.documentElement,{childList:true,subtree:true})}catch(e){}check()}`;
  return (
    `(function(){var d=0;function go(){${inject}}` +
    `function idle(){if(window.requestIdleCallback)requestIdleCallback(go,{timeout:${IDLE_TIMEOUT_MS}});else setTimeout(go,0)}` +
    wait +
    `if(document.readyState==="complete")wait();else addEventListener("load",wait,{once:true})})()`
  );
}

/**
 * Cloudflare Web Analytics beacon (cookieless, no consent banner needed), behind the automation guard.
 * Rendered only when NEXT_PUBLIC_CF_BEACON_TOKEN is set at build time.
 * `spa: true` records History API navigations, so room URLs count as views.
 */
export function Analytics({ token = CF_BEACON_TOKEN }: { token?: string }) {
  if (!token) return null;
  return <script id="hq-cf-beacon" dangerouslySetInnerHTML={{ __html: cfBeaconScript(token) }} />;
}
