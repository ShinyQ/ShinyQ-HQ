/**
 * Game-first load: an inline head script decides before first paint whether this visit opens the
 * 3D HQ. If it does, `html[data-hq-boot]` hides `#site-shell` behind the SSR boot cover until the
 * canvas renders its first frame (or the gate falls back to the page).
 */
export const BOOT_ATTR = "data-hq-boot";
export const BOOT_RELEASED_ATTR = "data-hq-boot-released";
export const BOOT_TIMEOUT_MS = 8000;

export type BootReleaseReason = "ready" | "page" | "static" | "timeout";

export interface BootFirstInput {
  path: string;
  search: string;
  storedView: string | null;
  hasWebGL2: boolean;
  saveData: boolean;
}

/**
 * Self-contained (no imports, no closures, no TS-only syntax in the body) so it can be inlined via
 * toString(). Routes match the pages that mount ExperienceGate (AGENTS.md, "3D experience").
 */
export function shouldBootFirst(i: BootFirstInput): boolean {
  if (!/^\/(en|id)(\/(journey|labs)(\/[^/]+)?|\/(library|contact))?\/?$/.test(i.path)) return false;
  if (/[?&]tier=static(&|$)/.test(i.search)) return false;
  if (i.storedView === "page") return false;
  return i.hasWebGL2 && !i.saveData;
}

/** Inline head script: sets data-hq-boot before first paint and arms a safety timeout. */
export function bootFirstScript(): string {
  return `(function(){try{var s=null;try{s=sessionStorage.getItem("hq:view")}catch(e){}
var c=navigator.connection;var on=(${shouldBootFirst.toString()})({path:location.pathname,search:location.search,storedView:s,hasWebGL2:typeof WebGL2RenderingContext!=="undefined",saveData:!!(c&&c.saveData)});
if(!on)return;var d=document.documentElement;d.setAttribute("${BOOT_ATTR}","1");
setTimeout(function(){if(d.hasAttribute("${BOOT_ATTR}")){d.removeAttribute("${BOOT_ATTR}");d.setAttribute("${BOOT_RELEASED_ATTR}","timeout")}},${BOOT_TIMEOUT_MS});}catch(e){}})();`;
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
