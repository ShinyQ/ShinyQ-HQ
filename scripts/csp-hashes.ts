/**
 * Post-build (last step of `bun run build`): a script policy without 'unsafe-inline' for every page of
 * the static export (security assessment F1.9, Round 7 D).
 *
 * For each out/**\/*.html it hashes every executable inline <script> (sha256 of the body as the HTML
 * parser sees it) and inserts right after <meta charSet="utf-8"/>, before any script:
 *   <meta http-equiv="Content-Security-Policy" content="script-src ...; worker-src ..." data-hq-csp=""/>
 * script-src is the site policy's script-src from out/_headers minus 'unsafe-inline', plus the page's
 * hashes. worker-src repeats the site value: a meta policy without it falls back to its own script-src,
 * which would block troika's blob: workers. The _headers policy keeps applying (frame-ancestors and every
 * directive a meta tag cannot set); browsers enforce both, so an inline script runs only when its hash is
 * listed. Then it checks every page and exits 1 on any problem, so the build fails when an inline script
 * lacks its hash. It must run after every step that edits HTML (defer-scripts, root-redirect).
 *
 * Usage: bun scripts/csp-hashes.ts [--dir out]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { addScriptPolicy, exportPolicyProblems, htmlFiles, inlineScripts, scriptHash, sitePolicy, withoutScriptPolicy } from "./csp-policy";

export * from "./csp-policy";

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dirIndex = args.indexOf("--dir");
  const dir = path.resolve(dirIndex >= 0 ? args[dirIndex + 1] : "out");
  const site = sitePolicy(readFileSync(path.join(dir, "_headers"), "utf8"));
  const files = htmlFiles(dir);
  let added = 0;
  let maxHashes = 0;
  for (const file of files) {
    const before = readFileSync(file, "utf8");
    const after = addScriptPolicy(before, site);
    maxHashes = Math.max(maxHashes, new Set(inlineScripts(after).map(scriptHash)).size);
    added += Buffer.byteLength(after) - Buffer.byteLength(withoutScriptPolicy(before));
    if (after !== before) writeFileSync(file, after);
  }
  const problems = exportPolicyProblems(dir);
  if (problems.length) {
    for (const p of problems) console.error(`csp-hashes: ${p}`);
    process.exit(1);
  }
  console.log(`csp-hashes: ${files.length} HTML files carry a script policy without 'unsafe-inline' (at most ${maxHashes} hashes per page, ${Math.round(added / files.length)} bytes per page on average)`);
}
