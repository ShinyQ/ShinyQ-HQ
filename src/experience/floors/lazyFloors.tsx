"use client";

import { lazy, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import type { FloorId } from "@/content/schema";
import { floorChunks, floorMount, isLazyFloor, type FloorChunkModules, type LazyFloor } from "./floorChunks";

/**
 * The on-demand floors (Round 7 B). A loaded chunk renders its component directly (`floorMount` explains
 * why not through React.lazy); while it loads the getter returns null. A floor whose import failed renders
 * through React.lazy: React caches a rejected lazy forever, so a failed import drops its wrapper and the
 * canvas remount after the crash (CanvasBoundary) gets a fresh one that retries the import.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- one map for floors with different props
const cache = new Map<LazyFloor, LazyExoticComponent<ComponentType<any>>>();

function lazyFloor<K extends LazyFloor, P>(id: K, pick: (m: FloorChunkModules[K]) => ComponentType<P>): () => ComponentType<P> | null {
  const viaLazy = () => {
    let wrapper = cache.get(id) as LazyExoticComponent<ComponentType<P>> | undefined;
    if (!wrapper) {
      wrapper = lazy(() =>
        floorChunks.load(id).then(
          (m) => ({ default: pick(m) }),
          (error: unknown) => {
            cache.delete(id);
            throw error;
          },
        ),
      );
      cache.set(id, wrapper);
    }
    return wrapper;
  };
  return () => {
    const mount = floorMount(floorChunks, id);
    if (mount === "lazy") return viaLazy();
    const mod = mount === "module" ? floorChunks.module(id) : null;
    return mod ? pick(mod) : null;
  };
}

export const labsFloor = lazyFloor("L3", (m) => m.Labs);
export const libraryFloor = lazyFloor("L4", (m) => m.Library);
export const roofFloor = lazyFloor("RF", (m) => m.Roof);

/**
 * Re-renders on every floor chunk state change and starts the import of each near floor that has not
 * been requested yet (with `?prefetch=off` nothing else would load a neighbour).
 */
export function useFloorChunks(near: readonly FloorId[]): void {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const off = floorChunks.subscribe(bump);
    bump();
    return off;
  }, []);
  const key = near.join(",");
  useEffect(() => {
    for (const id of key.split(",") as FloorId[]) if (isLazyFloor(id) && floorChunks.state(id) === "idle") floorChunks.ensure(id);
  }, [key]);
}
