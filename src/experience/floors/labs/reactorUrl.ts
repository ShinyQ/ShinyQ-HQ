import type { FloorId } from "@/content/schema";
import type { RoomReactor } from "@/content/room-views/types";
import type { ReactorTech } from "@/store/useHQStore";
import { techFromHash, techHash } from "./techHash";
import { techFromView } from "./techReactor";

/** Minimal store surface (the real zustand store satisfies it). */
export interface ReactorUrlStore {
  getState(): { floor: FloorId; phase: string; reactor: { tech: ReactorTech | null }; selectReactorTech: (tech: ReactorTech) => void };
  subscribe(listener: (state: ReturnType<ReactorUrlStore["getState"]>, prev: ReturnType<ReactorUrlStore["getState"]>) => void): () => void;
}

export interface ReactorUrlEnv {
  history: Pick<History, "replaceState" | "state">;
  location: { pathname: string; search: string; hash: string };
  /** The Tech Reactor drawer data (`/data/rooms/{locale}.json`). */
  load: () => Promise<RoomReactor | undefined>;
  /** Defers a write until other store listeners (room and floor URL sync) have written theirs. */
  defer?: (fn: () => void) => void;
  /** The hash the page loaded with (read before any URL sync could rewrite it); `location.hash` otherwise. */
  initialHash?: string;
  /** Back and forward (closing a room goes back to the floor entry, which has no hash). */
  onPopState?: (listener: () => void) => () => void;
}

/**
 * Tech Reactor deep link (design 2026-10-14): `#labs-tech=<slug>` mirrors the picked tech while the rover
 * is on L3, and a hash present on load picks that tech once the drawer data arrives. Other hashes
 * (`#highlights-...`) are never touched, and nothing is written during the boot or the intro (a deep link
 * keeps its URL until the rover arrives). Returns a disposer.
 */
export function createReactorHashSync({ store, env }: { store: ReactorUrlStore; env: ReactorUrlEnv }): () => void {
  let live = true;
  const defer = env.defer ?? ((fn: () => void) => queueMicrotask(fn));
  const wanted = techFromHash(env.initialHash ?? env.location.hash);
  if (wanted && store.getState().reactor.tech?.slug !== wanted) {
    env.load().then(
      (reactor) => {
        const tech = live ? techFromView(reactor, wanted) : null;
        if (tech && !store.getState().reactor.tech) store.getState().selectReactorTech(tech);
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
    if (current && current !== "#" && techFromHash(current) === null) return;
    const want = s.floor === "L3" ? techHash(s.reactor.tech?.slug ?? null) : "";
    if ((current === "#" ? "" : current) === want) return;
    env.history.replaceState(env.history.state, "", `${env.location.pathname}${env.location.search}${want}`);
  };
  const off = store.subscribe((s, prev) => {
    if (s.reactor.tech !== prev.reactor.tech || s.floor !== prev.floor || s.phase !== prev.phase) defer(write);
  });
  const offPop = env.onPopState?.(() => defer(write));
  return () => {
    live = false;
    off();
    offPop?.();
  };
}
