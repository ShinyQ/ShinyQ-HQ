/**
 * Zero-dependency static server for the `out/` export. It mirrors Cloudflare
 * Pages resolution: /path -> path, path.html, path/index.html, else 404.html.
 * Simple static rules in `<dir>/_redirects` ("/from /to [status]") are honored
 * before file resolution; splats and placeholders are ignored. Text assets are
 * gzipped when the client accepts it, like Cloudflare.
 * Usage: bun scripts/serve-static.ts [--port 4173] [--dir out]
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface StaticServer {
  url: string;
  stop: () => void;
}

export interface RedirectRule {
  from: string;
  to: string;
  status: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function parseRedirects(source: string): RedirectRule[] {
  const rules: RedirectRule[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [from, to, statusText] = line.split(/\s+/);
    if (!from?.startsWith("/") || !to) continue;
    if (from.includes("*") || from.includes(":")) continue;
    const status = statusText ? Number(statusText) : 302;
    if (!REDIRECT_STATUSES.has(status)) continue;
    rules.push({ from, to, status });
  }
  return rules;
}

function loadRedirects(root: string): Map<string, RedirectRule> {
  const file = path.join(root, "_redirects");
  if (!existsSync(file)) return new Map();
  return new Map(parseRedirects(readFileSync(file, "utf8")).map((rule) => [rule.from, rule]));
}

function resolveFile(root: string, pathname: string): string | null {
  const clean = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const base = path.join(root, clean);
  if (!base.startsWith(root)) return null;
  const candidates = [base, `${base}.html`, path.join(base, "index.html")];
  return candidates.find((file) => existsSync(file) && statSync(file).isFile()) ?? null;
}

const COMPRESSIBLE = /\.(html|js|css|json|txt|svg|xml|map)$/;

/** Gzips text assets like Cloudflare does, so Lighthouse transfer sizes are realistic. */
async function serveFile(file: string, request: Request): Promise<Response> {
  const body = Bun.file(file);
  const accepts = request.headers.get("accept-encoding") ?? "";
  if (!COMPRESSIBLE.test(file) || !/\bgzip\b/.test(accepts)) return new Response(body);
  const gzipped = Bun.gzipSync(new Uint8Array(await body.arrayBuffer()));
  return new Response(gzipped, {
    headers: { "content-type": body.type, "content-encoding": "gzip", vary: "accept-encoding" },
  });
}

export function startStaticServer({ dir = "out", port = 0 }: { dir?: string; port?: number } = {}): StaticServer {
  const root = path.resolve(dir);
  if (!existsSync(root)) throw new Error(`Static directory not found: ${root}. Run "bun run build" first.`);
  const redirects = loadRedirects(root);
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch(request) {
      const { pathname, search } = new URL(request.url);
      const redirect = redirects.get(pathname);
      if (redirect) {
        const location = redirect.to.includes("?") || !search ? redirect.to : `${redirect.to}${search}`;
        return new Response(null, { status: redirect.status, headers: { location } });
      }
      const file = resolveFile(root, pathname === "/" ? "/index" : pathname);
      if (file) return serveFile(file, request);
      const notFound = path.join(root, "404.html");
      return new Response(existsSync(notFound) ? Bun.file(notFound) : "Not found", {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const server = startStaticServer({ dir: arg("dir") ?? "out", port: Number(arg("port") ?? 4173) });
  console.log(`Serving ${arg("dir") ?? "out"} at ${server.url}`);
}
