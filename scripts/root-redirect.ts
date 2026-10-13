/**
 * Post-build (part of `bun run build`): copies the "/" language redirect to the top of <head> in
 * out/index.html, so it runs before the render-blocking stylesheet arrives (REPORT A2.1). React keeps
 * the original inside <main> (hydration still matches); its `window.__hqRedirect` guard makes it a no-op.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SCRIPT = /<script id="hq-root-redirect">([\s\S]*?)<\/script>/;

export function hoistRootRedirect(html: string): string {
  if (html.includes("data-hq-hoisted")) return html;
  const match = SCRIPT.exec(html);
  if (!match) throw new Error('root-redirect: <script id="hq-root-redirect"> not found');
  const charset = /<meta charSet="utf-8"\/?>/i.exec(html);
  const head = html.indexOf("<head>");
  if (!charset && head < 0) throw new Error("root-redirect: no <head>");
  const at = charset ? charset.index + charset[0].length : head + "<head>".length;
  return `${html.slice(0, at)}<script data-hq-hoisted="">${match[1]}</script>${html.slice(at)}`;
}

if (import.meta.main) {
  const file = path.join(process.cwd(), "out", "index.html");
  writeFileSync(file, hoistRootRedirect(readFileSync(file, "utf8")));
  console.log("root-redirect: / redirect runs before the stylesheet");
}
