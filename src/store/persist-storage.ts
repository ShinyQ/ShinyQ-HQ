import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * zustand 5 `persist` writes on every `set`, whatever changed (`api.setState` calls `setItem`), so
 * per-frame and 10 Hz store updates would serialize and write localStorage each time. This wrapper
 * writes only when a persisted key (shallow, `Object.is`) or the version changed since the last read
 * or write (perf report D 6.2).
 */
export function skipUnchanged<S extends object>(inner: PersistStorage<S> | undefined): PersistStorage<S> | undefined {
  if (!inner) return inner;
  const last = new Map<string, StorageValue<S>>();
  const same = (a: StorageValue<S>, b: StorageValue<S>) => {
    if (a.version !== b.version) return false;
    const keys = Object.keys(a.state) as (keyof S)[];
    return keys.length === Object.keys(b.state).length && keys.every((key) => Object.is(a.state[key], b.state[key]));
  };
  const remember = (name: string, value: StorageValue<S> | null) => {
    if (value) last.set(name, value);
    else last.delete(name);
    return value;
  };
  return {
    getItem: (name) => {
      const value = inner.getItem(name);
      return value instanceof Promise ? value.then((v) => remember(name, v)) : remember(name, value);
    },
    setItem: (name, value) => {
      const previous = last.get(name);
      if (previous && same(previous, value)) return undefined;
      last.set(name, value);
      return inner.setItem(name, value);
    },
    removeItem: (name) => {
      last.delete(name);
      return inner.removeItem(name);
    },
  };
}
