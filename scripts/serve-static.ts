/**
 * Zero-dependency static server for the `out/` export. It mirrors Cloudflare
 * Pages resolution: /path -> path, path.html, path/index.html, else 404.html.
 * Usage: bun scripts/serve-static.ts [--port 4173] [--dir out]
 */
import { existsSync, statSync } from "node:fs";
import path from "node:path";

export interface StaticServer {
  url: string;
  stop: () => void;
}

function resolveFile(root: string, pathname: string): string | null {
  const clean = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const base = path.join(root, clean);
  if (!base.startsWith(root)) return null;
  const candidates = [base, `${base}.html`, path.join(base, "index.html")];
  return candidates.find((file) => existsSync(file) && statSync(file).isFile()) ?? null;
}

export function startStaticServer({ dir = "out", port = 0 }: { dir?: string; port?: number } = {}): StaticServer {
  const root = path.resolve(dir);
  if (!existsSync(root)) throw new Error(`Static directory not found: ${root}. Run "bun run build:web" first.`);
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch(request) {
      const { pathname } = new URL(request.url);
      const file = resolveFile(root, pathname === "/" ? "/index" : pathname);
      if (file) return new Response(Bun.file(file));
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
