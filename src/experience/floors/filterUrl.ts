import type { FloorId } from "@/content/schema";
import { filterFromHash, filterHash } from "./filterHash";

/** Minimal store surface (the real zustand store satisfies it): `S` is the state shape it reads. */
export interface FilterUrlStore<S> {
  getState(): S;
  subscribe(listener: (state: S, prev: S) => void): () => void;
}

export interface FilterUrlEnv<V> {
  history: Pick<History, "replaceState" | "state">;
  location: { pathname: string; search: string; hash: string };
  /** The drawer data the deep link resolves against (its floor's file, `/data/rooms/{locale}-{floor}.json`). */
  load: () => Promise<V | undefined>;
  /** Defers a write until other store listeners (room and floor URL sync) have written theirs. */
  defer?: (fn: () => void) => void;
  /** The hash the page loaded with (read before any URL sync could rewrite it); `location.hash` otherwise. */
  initialHash?: string;
  /** Back and forward (closing a room goes back to the floor entry, which has no hash). */
  onPopState?: (listener: () => void) => () => void;
}

export interface FilterUrlSpec<S extends { floor: FloorId; phase: string }, V, P> {
  /** The floor that owns the hash. */
  floor: FloorId;
  /** Hash key (`labs-tech`, `library-topic`). */
  key: string;
  /** The current pick of the state. */
  picked: (state: S) => P | null;
  /** Its slug. */
  slugOf: (pick: P) => string;
  /** The pick for a slug from the drawer data; null when unknown. */
  fromView: (view: V | undefined, slug: string) => P | null;
  /** Applies a pick from the deep link. */
  select: (state: S, pick: P) => void;
}

/**
 * Floor filter deep link (the L3 Tech Reactor, the L4 Topic Constellation): `#<key>=<slug>` mirrors the
 * pick while the rover is on `floor`, and a hash present on load picks that slug once the drawer data
 * arrives. Other hashes (`#highlights-...`, the other floor's key) are never touched, and nothing is
 * written during the boot or the intro (a deep link keeps its URL until the rover arrives). Returns a disposer.
 */
export function createFilterHashSync<S extends { floor: FloorId; phase: string }, V, P>({
  store,
  env,
  spec,
}: {
  store: FilterUrlStore<S>;
  env: FilterUrlEnv<V>;
  spec: FilterUrlSpec<S, V, P>;
}): () => void {
  let live = true;
  const defer = env.defer ?? ((fn: () => void) => queueMicrotask(fn));
  const slugOf = (s: S) => {
    const pick = spec.picked(s);
    return pick ? spec.slugOf(pick) : null;
  };
  const wanted = filterFromHash(env.initialHash ?? env.location.hash, spec.key);
  if (wanted && slugOf(store.getState()) !== wanted) {
    env.load().then(
      (view) => {
        const pick = live ? spec.fromView(view, wanted) : null;
        if (pick && !spec.picked(store.getState())) spec.select(store.getState(), pick);
      },
      () => undefined,
    );
  }
  const write = () => {
    if (!live) return;
    const s = store.getState();
    if (s.phase === "boot" || s.phase === "intro") return;
    const current = env.location.hash;
    // Only our own hash (or none) is ours to change.
    if (current && current !== "#" && filterFromHash(current, spec.key) === null) return;
    const want = s.floor === spec.floor ? filterHash(spec.key, slugOf(s)) : "";
    if ((current === "#" ? "" : current) === want) return;
    env.history.replaceState(env.history.state, "", `${env.location.pathname}${env.location.search}${want}`);
  };
  const off = store.subscribe((s, prev) => {
    if (spec.picked(s) !== spec.picked(prev) || s.floor !== prev.floor || s.phase !== prev.phase) defer(write);
  });
  const offPop = env.onPopState?.(() => defer(write));
  return () => {
    live = false;
    off();
    offPop?.();
  };
}
