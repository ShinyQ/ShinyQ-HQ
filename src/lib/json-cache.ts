/**
 * One cached JSON fetch per key for the client's static data files (the Glass Drawer room files, the floating hologram
 * shapes): concurrent loads share one request, a parsed file is kept for the session (`peekJson` reads it without
 * waiting a tick), and a failed load is forgotten so the next call tries again.
 */
const pending = new Map<string, Promise<unknown>>();
const ready = new Map<string, unknown>();

export function loadJson<T>(url: string, key = url): Promise<T> {
  let load = pending.get(key) as Promise<T> | undefined;
  if (!load) {
    load = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const value = (await res.json()) as T;
      ready.set(key, value);
      return value;
    });
    load.catch(() => pending.delete(key));
    pending.set(key, load);
  }
  return load;
}

/** A file already loaded under `key`, else undefined. */
export const peekJson = <T>(key: string) => ready.get(key) as T | undefined;

/** The cache itself, for test helpers (`tests/helpers/json-cache.ts`) only. */
export const jsonCache = { pending, ready };
