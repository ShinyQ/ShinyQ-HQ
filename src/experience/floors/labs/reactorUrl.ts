import type { FloorId } from "@/content/schema";
import type { RoomReactor } from "@/content/room-views/types";
import type { ReactorTech } from "@/store/useHQStore";
import { createFilterHashSync, type FilterUrlEnv } from "../filterUrl";
import { TECH_HASH } from "./techHash";
import { techFromView } from "./techReactor";

/** Minimal store surface (the real zustand store satisfies it). */
export interface ReactorUrlStore {
  getState(): { floor: FloorId; phase: string; reactor: { tech: ReactorTech | null }; selectReactorTech: (tech: ReactorTech) => void };
  subscribe(listener: (state: ReturnType<ReactorUrlStore["getState"]>, prev: ReturnType<ReactorUrlStore["getState"]>) => void): () => void;
}

/** The Tech Reactor drawer data (`/data/rooms/{locale}.json`) is what `load` returns. */
export type ReactorUrlEnv = FilterUrlEnv<RoomReactor>;

/**
 * Tech Reactor deep link (design 2026-10-14): `#labs-tech=<slug>` mirrors the picked tech while the rover
 * is on L3, and a hash present on load picks that tech once the drawer data arrives (`createFilterHashSync`).
 * Returns a disposer.
 */
export function createReactorHashSync({ store, env }: { store: ReactorUrlStore; env: ReactorUrlEnv }): () => void {
  return createFilterHashSync({
    store,
    env,
    spec: {
      floor: "L3",
      key: TECH_HASH,
      picked: (s) => s.reactor.tech,
      slugOf: (tech) => tech.slug,
      fromView: techFromView,
      select: (s, tech) => s.selectReactorTech(tech),
    },
  });
}
