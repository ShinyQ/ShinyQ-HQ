/**
 * Game-first load: an inline head script decides before first paint whether this visit opens the
 * 3D HQ. If it does, `html[data-hq-boot]` hides `#site-shell` behind the SSR boot cover until the
 * canvas renders its first frame (or the gate falls back to the page).
 */
import { SOFTWARE_RENDERER } from "./gpu-tier";

export const BOOT_ATTR = "data-hq-boot";
export const BOOT_RELEASED_ATTR = "data-hq-boot-released";
export const BOOT_TIMEOUT_MS = 8000;
/** sessionStorage key: "static" once the gate auto-detected the static tier (software renderer). */
export const PROBE_KEY = "hq:probe";

export type BootReleaseReason = "ready" | "page" | "static" | "timeout";

export interface BootFirstInput {
  path: string;
  search: string;
  storedView: string | null;
  hasWebGL2: boolean;
  saveData: boolean;
  /** navigator.userAgent: crawlers and Lighthouse measure the HTML page, never the 3D chunk. */
  userAgent?: string;
  /** sessionStorage[PROBE_KEY]: the gate already found this device static in this session. */
  probe?: string | null;
}

/**
 * Self-contained (no imports, no closures, no TS-only syntax in the body) so it can be inlined via
 * toString(). Routes match the pages that mount ExperienceGate (AGENTS.md, "3D experience").
 */
export function shouldBootFirst(i: BootFirstInput): boolean {
  if (!/^\/(en|id)(\/(journey|labs)(\/[^/]+)?|\/(library|contact))?\/?$/.test(i.path)) return false;
  if (/[?&]tier=static(&|$)/.test(i.search)) return false;
  if (i.storedView === "page") return false;
  if (/bot|crawl|spider|slurp|lighthouse|pagespeed/i.test(i.userAgent || "")) return false;
  if (i.probe === "static" && !/[?&]tier=(lite|full)(&|$)/.test(i.search)) return false;
  return i.hasWebGL2 && !i.saveData;
}

/**
 * Inline head script: sets data-hq-boot before first paint and arms a safety timeout. Right after
 * the first paint (before hydration) it probes WebGL once and stores the result in
 * `window.__hqProbe` for the gate (readTierInputs). Without WebGL2 or on a software renderer it
 * releases the cover at once and remembers the verdict for the session, unless `?tier=` forces one.
 */
export function bootFirstScript(): string {
  return `(function(){try{var s=null,p=null;try{s=sessionStorage.getItem("hq:view");p=sessionStorage.getItem("${PROBE_KEY}")}catch(e){}
var c=navigator.connection;var on=(${shouldBootFirst.toString()})({path:location.pathname,search:location.search,storedView:s,hasWebGL2:typeof WebGL2RenderingContext!=="undefined",saveData:!!(c&&c.saveData),userAgent:navigator.userAgent,probe:p});
if(!on)return;var d=document.documentElement;d.setAttribute("${BOOT_ATTR}","1");
var off=function(r){if(d.hasAttribute("${BOOT_ATTR}")){d.removeAttribute("${BOOT_ATTR}");d.setAttribute("${BOOT_RELEASED_ATTR}",r)}};
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
}

/** Boot log lines carry an "[ ok ]" marker in the copy; the cover and overlay color it apart. */
export function splitBootLine(line: string): { ok: boolean; text: string } {
  const m = /^\[ ok \]\s*/.exec(line);
  return m ? { ok: true, text: line.slice(m[0].length) } : { ok: false, text: line };
}
