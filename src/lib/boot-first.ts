/**
 * Game-first load: an inline head script decides before first paint whether this visit opens the
 * 3D HQ. If it does, `html[data-hq-boot]` hides `#site-shell` behind the SSR boot cover until the
 * canvas renders its first frame (or the gate falls back to the page).
 */
import { SOFTWARE_RENDERER } from "./gpu-tier";
import { MOTION_ATTR, storedMotion } from "./motion";
import { markOnce, PERF_MARKS } from "./perf-marks";

export const BOOT_ATTR = "data-hq-boot";
export const BOOT_RELEASED_ATTR = "data-hq-boot-released";
export const BOOT_TIMEOUT_MS = 8000;
/** sessionStorage key: "static" once the gate auto-detected the static tier (software renderer). */
export const PROBE_KEY = "hq:probe";
/** The persisted HQ store (`STORE_KEY` in src/store/useHQStore.ts); its `motion` drives html[data-motion]. */
export const MOTION_STORE_KEY = "hq:v1";

/** Set on <html> before first paint wherever 3D could run; the landing shows "Enter the 3D HQ" only then. */
export const OFFER_3D_ATTR = "data-hq-3d";
/** Set on <html> before first paint for automation and crawlers: the landing holds its still frame (ambientStill). */
export const STILL_ATTR = "data-hq-still";

export interface Offer3DInput {
  search: string;
  hasWebGL2: boolean;
  saveData: boolean;
  /** isBotLike(navigator, search). */
  bot?: boolean;
}

export type BootReleaseReason = "ready" | "page" | "static" | "timeout";

export interface BootFirstInput {
  path: string;
  search: string;
  storedView: string | null;
  hasWebGL2: boolean;
  saveData: boolean;
  /** isBotLike(navigator, search): crawlers and automation measure the HTML page, never the 3D chunk. */
  bot?: boolean;
  /** sessionStorage[PROBE_KEY]: the gate already found this device static in this session. */
  probe?: string | null;
}

export interface BotLikeNavigator {
  userAgent?: string;
  webdriver?: boolean;
}

/**
 * Crawlers, link previews and audits (Googlebot, bingbot, PageSpeed, Lighthouse) get the HTML page
 * and never download the 3D chunk. So does browser automation (`navigator.webdriver`, which covers
 * Lighthouse 12, whose emulated user agent no longer says "Lighthouse"), unless the URL forces a 3D
 * tier with `?tier=lite|full` (Playwright tests). Self-contained, like shouldBootFirst, so the head
 * script inlines it via toString().
 */
export function isBotLike(n: BotLikeNavigator, search: string): boolean {
  if (/bot\/|bot;|\bbot\b|crawl|spider|slurp|lighthouse|pagespeed|google-inspectiontool|facebookexternalhit|bingpreview|gtmetrix/i.test(n.userAgent || "")) return true;
  return n.webdriver === true && !/[?&]tier=(lite|full)(&|$)/.test(search);
}

/**
 * Self-contained (no imports, no closures, no TS-only syntax in the body) so it can be inlined via
 * toString(). Routes match the pages that mount ExperienceGate (AGENTS.md, "3D experience").
 */
export function shouldBootFirst(i: BootFirstInput): boolean {
  if (!/^\/(en|id)(\/(journey|labs)(\/[^/]+)?|\/(library|contact))?\/?$/.test(i.path)) return false;
  if (/[?&]tier=static(&|$)/.test(i.search)) return false;
  if (i.storedView === "page") return false;
  if (i.bot) return false;
  if (i.probe === "static" && !/[?&]tier=(lite|full)(&|$)/.test(i.search)) return false;
  return i.hasWebGL2 && !i.saveData;
}

/**
 * Whether the Page View may offer "Enter the 3D HQ": WebGL2 exists, Save-Data is off, the visitor is
 * not bot-like and the URL does not force the static tier. Unlike shouldBootFirst it ignores the route,
 * the stored Page View choice and the session probe (a software renderer can still run the forced lite
 * tier). Self-contained (no imports, no closures, no TS-only syntax in the body) for toString().
 */
export function canOffer3D(i: Offer3DInput): boolean {
  if (/[?&]tier=static(&|$)/.test(i.search)) return false;
  if (i.bot) return false;
  return i.hasWebGL2 && !i.saveData;
}

/**
 * Whether the landing's ambient motion (the hero backdrop and the stats ticker) holds its still frame,
 * the frame visitors see under reduced motion. True under automation
 * (`navigator.webdriver`: Playwright, Lighthouse 12) and for crawlers: nobody watches it there, and on a
 * software compositor (SwiftShader in CI) the infinite animations queue seconds of GPU work that stall
 * the page's main thread and the next browser call, even after navigating away (13 s at 1999x1129).
 * `?ambient=on` keeps the motion for a capture or a test that needs it. Self-contained for toString().
 */
export function ambientStill(webdriver: boolean | undefined, bot: boolean, search: string): boolean {
  if (/[?&]ambient=on(&|$)/.test(search)) return false;
  return webdriver === true || bot;
}

/**
 * `?view=page` is the boot card's "Classic site" link (a real link, so it works before hydration): the
 * head script stores the Page View choice and drops the parameter. Returns the search without it, or
 * null when it is absent. Self-contained (no imports, no closures) for toString().
 */
export function takePageViewParam(search: string): string | null {
  if (!/[?&]view=page(&|$)/.test(search)) return null;
  const rest = search
    .replace(/^\?/, "")
    .split("&")
    .filter((part) => part !== "view=page")
    .join("&");
  return rest ? "?" + rest : "";
}

/**
 * Inline head script: sets data-hq-boot before first paint and arms a safety timeout. Right after
 * the first paint (before hydration) it probes WebGL once and stores the result in
 * `window.__hqProbe` for the gate (readTierInputs). Without WebGL2 or on a software renderer it
 * releases the cover at once and remembers the verdict for the session, unless `?tier=` forces one.
 * It also sets html[data-hq-3d] (canOffer3D), html[data-hq-still] (ambientStill) and html[data-motion] (the
 * visitor's Motion setting, storedMotion: `full` by default, also without storage) on every page, before first paint.
 */
export function bootFirstScript(): string {
  return `(function(){try{var s=null,p=null;try{s=sessionStorage.getItem("hq:view");p=sessionStorage.getItem("${PROBE_KEY}")}catch(e){}
var q=(${takePageViewParam.toString()})(location.search);if(q!==null){s="page";try{sessionStorage.setItem("hq:view","page")}catch(e){}try{history.replaceState(history.state,"",location.pathname+q+location.hash)}catch(e){}}
var d=document.documentElement,ms=null;try{ms=localStorage.getItem("${MOTION_STORE_KEY}")}catch(e){}var m=(${storedMotion.toString()})(ms);if(m)d.setAttribute("${MOTION_ATTR}",m);
var c=navigator.connection,w=typeof WebGL2RenderingContext!=="undefined",sd=!!(c&&c.saveData),b=(${isBotLike.toString()})(navigator,location.search);
if((${canOffer3D.toString()})({search:location.search,hasWebGL2:w,saveData:sd,bot:b}))d.setAttribute("${OFFER_3D_ATTR}","1");
if((${ambientStill.toString()})(navigator.webdriver,b,location.search))d.setAttribute("${STILL_ATTR}","1");
var on=(${shouldBootFirst.toString()})({path:location.pathname,search:location.search,storedView:s,hasWebGL2:w,saveData:sd,bot:b,probe:p});
if(!on)return;d.setAttribute("${BOOT_ATTR}","1");
var off=function(r){if(d.hasAttribute("${BOOT_ATTR}")){d.removeAttribute("${BOOT_ATTR}");d.setAttribute("${BOOT_RELEASED_ATTR}",r);try{performance.mark("${PERF_MARKS.bootRelease}",{detail:r})}catch(e){}}};
setTimeout(function(){off("timeout")},${BOOT_TIMEOUT_MS});
requestAnimationFrame(function(){setTimeout(function(){var r={webgl2:false,renderer:""};try{var g=document.createElement("canvas").getContext("webgl2");if(g){r.webgl2=true;var x=g.getExtension("WEBGL_debug_renderer_info");r.renderer=String(g.getParameter(x?x.UNMASKED_RENDERER_WEBGL:g.RENDERER));var l=g.getExtension("WEBGL_lose_context");if(l)l.loseContext()}}catch(e){}
window.__hqProbe=r;if(/[?&]tier=/.test(location.search))return;if(!r.webgl2||/${SOFTWARE_RENDERER.source}/i.test(r.renderer)){try{sessionStorage.setItem("${PROBE_KEY}","static")}catch(e){}off("static")}},0)});}catch(e){}})();`;
}

/** True while the SSR boot cover is up, or after it was shown on this page load. */
export function bootCoverUsed(): boolean {
  if (typeof document === "undefined") return false;
  const d = document.documentElement;
  return d.hasAttribute(BOOT_ATTR) || d.getAttribute(BOOT_RELEASED_ATTR) === "ready";
}

export function releaseBootCover(reason: BootReleaseReason): void {
  const d = document.documentElement;
  if (!d.hasAttribute(BOOT_ATTR)) return;
  d.removeAttribute(BOOT_ATTR);
  d.setAttribute(BOOT_RELEASED_ATTR, reason);
  markOnce(PERF_MARKS.bootRelease, reason);
}

/** Boot log lines carry an "[ ok ]" marker in the copy; the cover and overlay color it apart. */
export function splitBootLine(line: string): { ok: boolean; text: string } {
  const m = /^\[ ok \]\s*/.exec(line);
  return m ? { ok: true, text: line.slice(m[0].length) } : { ok: false, text: line };
}
