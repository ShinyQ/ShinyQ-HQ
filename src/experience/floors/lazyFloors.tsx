"use client";

import { lazy, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import type { FloorId } from "@/content/schema";
import { floorChunks, floorMount, isLazyFloor, type FloorChunkModules, type FloorChunks, type LazyFloor } from "./floorChunks";

/**
 * The on-demand floors (Round 7 B). `floorMount` decides how a floor renders: a loaded chunk's component
 * directly, null while it loads, or a React.lazy wrapper after a failed import. React caches a rejected
 * lazy forever, so a rejection drops the wrapper and the canvas remount after the crash (CanvasBoundary)
 * gets a fresh one that retries the import.
 */
export function floorGetters<M extends Record<LazyFloor, unknown>>(source: Pick<FloorChunks<M>, "load" | "module" | "hasFailed">) {
  return <K extends LazyFloor, P>(id: K, pick: (m: M[K]) => ComponentType<P>) => floorGetter(source, id, pick);
}

function floorGetter<M extends Record<LazyFloor, unknown>, K extends LazyFloor, P>(
  source: Pick<FloorChunks<M>, "load" | "module" | "hasFailed">,
  id: K,
  pick: (m: M[K]) => ComponentType<P>,
): () => ComponentType<P> | null {
  let wrapper: LazyExoticComponent<ComponentType<P>> | null = null;
  return () => {
    const mount = floorMount(source, id, wrapper !== null);
    if (mount === "module") return pick(source.module(id) as M[K]);
    if (mount !== "lazy") return null;
    if (!wrapper) {
      const created: LazyExoticComponent<ComponentType<P>> = lazy(() =>
        source.load(id).then(
          (m) => ({ default: pick(m) }),
          (error: unknown) => {
            if (wrapper === created) wrapper = null;
            throw error;
          },
        ),
      );
      wrapper = created;
    }
    return wrapper;
  };
}

const appFloor = floorGetters<FloorChunkModules>(floorChunks);
export const labsFloor = appFloor("L3", (m) => m.Labs);
export const libraryFloor = appFloor("L4", (m) => m.Library);
export const roofFloor = appFloor("RF", (m) => m.Roof);
export const engineFloor = appFloor("B1", (m) => m.EngineRoom);

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
