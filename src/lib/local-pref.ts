/**
 * A small persisted preference: one localStorage key, a fallback for missing or invalid values, and
 * listeners for `useSyncExternalStore` (same tab through `set`, other tabs through the `storage` event).
 * Storage can be unavailable (private mode, blocked): the in-memory value still applies.
 */
export interface LocalPref<T extends string> {
  key: string;
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

const defaultStorage = () => (typeof window === "undefined" ? null : window.localStorage);

export function createLocalPref<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
  storage: () => Storage | null = defaultStorage,
): LocalPref<T> {
  const listeners = new Set<() => void>();
  let memory: T | null = null;
  const read = (): T => {
    try {
      const raw = storage()?.getItem(key);
      if (isValid(raw)) return raw;
    } catch {
      // Unreadable storage: fall back to memory.
    }
    return memory ?? fallback;
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) listeners.forEach((l) => l());
  };
  return {
    key,
    get: read,
    set(value) {
      if (read() === value) return;
      memory = value;
      try {
        storage()?.setItem(key, value);
      } catch {
        // Ignore: memory keeps the choice for this page.
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },
  };
}
