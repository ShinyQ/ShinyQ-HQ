"use client";

import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { floorChunks, type FloorChunkModules, type LazyFloor } from "./floorChunks";

/**
 * React.lazy wrappers for the on-demand floors (Round 7 B). React caches a rejected lazy forever, so a
 * failed import drops its wrapper: the canvas remount after the crash (CanvasBoundary) gets a fresh one.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- one map for floors with different props
const cache = new Map<LazyFloor, LazyExoticComponent<ComponentType<any>>>();

function lazyFloor<K extends LazyFloor, P>(id: K, pick: (m: FloorChunkModules[K]) => ComponentType<P>): () => LazyExoticComponent<ComponentType<P>> {
  return () => {
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
}

export const lazyLabs = lazyFloor("L3", (m) => m.Labs);
export const lazyLibrary = lazyFloor("L4", (m) => m.Library);
export const lazyRoof = lazyFloor("RF", (m) => m.Roof);
