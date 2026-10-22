import type { EdgeCache, OfficeEnv, PagesContext, ServiceBinding } from "../../functions/_lib/types";

/** A fake hq-office service binding: `reply` answers each path (with its query); `calls` keeps every request. */
export function worker(reply: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const binding: ServiceBinding = {
    async fetch(input, init) {
      const url = new URL(typeof input === "string" ? input : input.url);
      const path = url.pathname + url.search;
      calls.push({ path, init });
      return reply(path, init);
    },
  };
  return { binding, calls };
}

/** The edge cache as a Map keyed by URL; `cache.keys()` lists the stored keys. */
export function memoryCache() {
  const map = new Map<string, Response>();
  const cache: EdgeCache & { keys(): string[] } = {
    async match(request) {
      return map.get(request.url)?.clone();
    },
    async put(request, response) {
      map.set(request.url, response);
    },
    keys: () => [...map.keys()],
  };
  return { map, cache };
}

/** A Pages context for `url`; `waitUntil` runs its promise (the memory cache stores synchronously). */
export function ctx(url: string, env: OfficeEnv, headers: Record<string, string> = {}, method = "GET"): PagesContext<OfficeEnv> {
  return { request: new Request(url, { method, headers }), env, waitUntil: (p) => void p };
}
