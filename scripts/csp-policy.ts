/**
 * The per-page script policy (Round 7 D, security assessment F1.9) as pure functions, without a CLI:
 * scripts/csp-hashes.ts (the build step) re-exports them, and Playwright specs import this file
 * directly (Playwright loads specs as CommonJS, where the CLI's `import.meta.main` does not parse).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const CSP_MARKER = "data-hq-csp";
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const OUR_META_RE = /<meta http-equiv="Content-Security-Policy" content="[^"]*" data-hq-csp=""\/>/g;
const ANY_META_RE = /<meta\b[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi;
const CHARSET_RE = /<meta charset="utf-8"\s*\/?>/i;
const HEAD_RE = /<head\b[^>]*>/i;
/** Types the browser executes (and CSP checks): classic and module scripts, import maps, speculation rules. */
const EXECUTABLE_TYPE = /^(|module|importmap|speculationrules|(text|application)\/(x-)?(java|ecma)script)$/i;

const attr = (attrs: string, name: string) => new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);

export function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return htmlFiles(file);
    return name.endsWith(".html") ? [file] : [];
  });
}

export function inlineScripts(html: string): string[] {
  const bodies: string[] = [];
  for (const [, attrs, body] of html.matchAll(SCRIPT_RE)) {
    if (attr(attrs, "src")) continue;
    const type = attr(attrs, "type");
    const value = (type?.[1] ?? type?.[2] ?? type?.[3] ?? "").trim();
    if (EXECUTABLE_TYPE.test(value)) bodies.push(body);
  }
  return bodies;
}

export function scriptHash(body: string): string {
  return `'sha256-${createHash("sha256").update(body.replace(/\r\n?/g, "\n"), "utf8").digest("base64")}'`;
}

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...values]) => [name.toLowerCase(), values]),
  );
}

export function sitePolicy(headers: string): string {
  const lines = headers.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "/*");
  if (start < 0) throw new Error("csp-hashes: no /* block in _headers");
  for (const line of lines.slice(start + 1)) {
    if (!/^\s/.test(line) && line.trim()) break;
    const m = /^\s*Content-Security-Policy:\s*(.+)$/.exec(line);
    if (m) return m[1].trim();
  }
  throw new Error("csp-hashes: the /* block of _headers has no Content-Security-Policy");
}

export function pagePolicy(site: string, hashes: readonly string[]): string {
  const d = directives(site);
  const script = d.get("script-src");
  if (!script) throw new Error("csp-hashes: the site policy has no script-src");
  const worker = d.get("worker-src");
  if (!worker) throw new Error("csp-hashes: the site policy has no worker-src");
  const sources = script.filter((s) => s !== "'unsafe-inline'" && s !== "'unsafe-hashes'" && !s.startsWith("'sha256-"));
  return `script-src ${[...sources, ...hashes].join(" ")}; worker-src ${worker.join(" ")}`;
}

export function addScriptPolicy(html: string, site: string): string {
  const clean = html.replace(OUR_META_RE, "");
  const head = HEAD_RE.exec(clean);
  if (!head) throw new Error("csp-hashes: no <head>");
  const charset = CHARSET_RE.exec(clean);
  const at = charset && charset.index > head.index ? charset.index + charset[0].length : head.index + head[0].length;
  const first = clean.search(/<script\b/i);
  if (first >= 0 && first < at) throw new Error("csp-hashes: a script comes before the policy insertion point");
  const hashes = [...new Set(inlineScripts(clean).map(scriptHash))];
  const meta = `<meta http-equiv="Content-Security-Policy" content="${pagePolicy(site, hashes)}" ${CSP_MARKER}=""/>`;
  return clean.slice(0, at) + meta + clean.slice(at);
}

const snippet = (body: string) => JSON.stringify(body.trim().slice(0, 40));

export function scriptPolicyProblems(html: string, site?: string): string[] {
  const problems: string[] = [];
  const metas = [...html.matchAll(ANY_META_RE)];
  const ours = metas.filter((m) => m[0].includes(CSP_MARKER));
  if (ours.length === 0) return ["no data-hq-csp script policy"];
  if (metas.length !== 1) problems.push(`expected one policy meta tag, found ${metas.length}`);
  const tag = ours[0];
  const policy = /content="([^"]*)"/.exec(tag[0])?.[1] ?? "";
  const script = directives(policy).get("script-src") ?? [];
  if (script.includes("'unsafe-inline'")) problems.push("script-src allows 'unsafe-inline'");
  const first = html.search(/<script\b/i);
  if (first >= 0 && first < tag.index) problems.push("a script comes before the policy");
  const end = html.search(/<\/head>/i);
  if (end >= 0 && tag.index > end) problems.push("the policy is outside <head>");
  const listed = new Set(script);
  inlineScripts(html).forEach((body, i) => {
    if (!listed.has(scriptHash(body))) problems.push(`missing hash for inline script #${i + 1} ${snippet(body)}`);
  });
  if (site) {
    const expected = pagePolicy(site, [...new Set(inlineScripts(html).map(scriptHash))]);
    if (policy !== expected) problems.push("the script policy differs from the one derived from _headers");
  }
  const markup = html.replace(SCRIPT_RE, "<script></script>");
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(markup)) problems.push("inline event handler attribute (blocked without 'unsafe-hashes')");
  if (/\s(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/i.test(markup)) problems.push("javascript: URL (blocked by the script policy)");
  return problems;
}

export function exportPolicyProblems(dir: string): string[] {
  const site = sitePolicy(readFileSync(path.join(dir, "_headers"), "utf8"));
  return htmlFiles(dir).flatMap((file) => scriptPolicyProblems(readFileSync(file, "utf8"), site).map((p) => `${path.relative(dir, file)}: ${p}`));
}

/** The page without the policy meta tag that `addScriptPolicy` inserts. */
export function withoutScriptPolicy(html: string): string {
  return html.replace(OUR_META_RE, "");
}
