/**
 * Post-build step for the static export: requests the Next.js chunks only after the first
 * contentful paint, so they do not compete with the HTML, CSS and preloaded fonts for bandwidth.
 *
 * Next.js emits every chunk as `<script src async>` (plus a low priority preload for the
 * bootstrap chunk) with no option to delay them. On a slow connection (and in Lighthouse's
 * simulated mobile throttling) those ~200 KB load in parallel with the critical resources and
 * push the Largest Contentful Paint back by about a second. The pages are fully server
 * rendered, so the hero text paints without JavaScript; hydration starts right after it.
 *
 * The chunks are already `async`, and the Turbopack runtime and `self.__next_f` queue are
 * order independent, so one inline loader may insert them in their original order. It waits
 * for the `first-contentful-paint` entry, falls back to the first frame where the Paint
 * Timing API is missing, loads at once in hidden tabs (no paint happens there) and has a
 * timeout as a last resort.
 *
 * Usage: bun scripts/defer-scripts.ts [--dir out]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const SCRIPT_TAG = /<script src="(\/_next\/static\/chunks\/[^"]+\.js)" async=""><\/script>/g;
const SCRIPT_PRELOAD = /<link rel="preload" as="script" fetchPriority="low" href="\/_next\/static\/chunks\/[^"]+\.js"\/>/g;
/** Marks pages that were already transformed, so running the step twice is harmless. */
export const LOADER_MARKER = "data-hq-defer";
/** Last-resort delay when no paint is observed (for example a page that never paints text). */
export const LOADER_TIMEOUT_MS = 3000;

export function loaderScript(srcs: readonly string[]): string {
  const list = JSON.stringify(srcs).replace(/</g, "\\u003c");
  const body =
    `(function(){var s=${list},d=0;` +
    `function go(){if(d)return;d=1;for(var i=0;i<s.length;i++){var e=document.createElement("script");e.src=s[i];e.async=true;document.head.appendChild(e)}}` +
    `if(document.visibilityState!=="visible"){go();return}` +
    `setTimeout(go,${LOADER_TIMEOUT_MS});` +
    `try{if(PerformanceObserver.supportedEntryTypes.indexOf("paint")>-1){new PerformanceObserver(function(l){if(l.getEntriesByName("first-contentful-paint").length)go()}).observe({type:"paint",buffered:true});return}}catch(x){}` +
    `requestAnimationFrame(function(){setTimeout(go,0)})})()`;
  return `<script ${LOADER_MARKER}="">${body}</script>`;
}

/** Replaces the Next.js chunk tags of one HTML page with the paint-gated loader. */
export function deferNextScripts(html: string): string {
  if (html.includes(LOADER_MARKER)) return html;
  const srcs = [...html.matchAll(SCRIPT_TAG)].map((match) => match[1]);
  if (srcs.length === 0) return html;
  const unique = [...new Set(srcs)];
  let placed = false;
  return html
    .replace(SCRIPT_PRELOAD, "")
    .replace(SCRIPT_TAG, () => {
      if (placed) return "";
      placed = true;
      return loaderScript(unique);
    });
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return htmlFiles(file);
    return name.endsWith(".html") ? [file] : [];
  });
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dirIndex = args.indexOf("--dir");
  const dir = path.resolve(dirIndex >= 0 ? args[dirIndex + 1] : "out");
  let changed = 0;
  const files = htmlFiles(dir);
  for (const file of files) {
    const before = readFileSync(file, "utf8");
    const after = deferNextScripts(before);
    if (after !== before) {
      writeFileSync(file, after);
      changed += 1;
    }
  }
  console.log(`defer-scripts: ${changed} of ${files.length} HTML files now load Next.js chunks after first paint`);
}
