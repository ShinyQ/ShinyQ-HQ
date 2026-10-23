"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Object3D } from "three";
import { getHQStore } from "@/store/useHQStore";
import { forgetDrawn, whenDrawn } from "../scene/drawnWork";
import { sceneProbes } from "./probes";

/** Parsed `items` per shapes URL (the session cache: a revisit mounts with the unique shapes at once). */
const ready = new Map<string, Record<string, unknown>>();
const inflight = new Map<string, Promise<void>>();

function load(url: string): Promise<void> {
  let p = inflight.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: { items: Record<string, unknown> }) => void ready.set(url, j.items));
    // A failed fetch is tried again on the floor's next mount.
    p.catch(() => inflight.delete(url));
    inflight.set(url, p);
  }
  return p;
}

/**
 * A floor's unique hologram shapes (`public/shapes/<floor>.<hash>.json`, `src/content/shapes.ts`): the fetch starts
 * right before the first render that shows `group` (`whenDrawn`), then the unique shapes crossfade in over 0.6 s
 * (`fade.current`: 0 to 1, read per frame; at once under reduced motion) and `done` turns true, when the fallback unmounts.
 * Until then, and on a failed fetch, the floor keeps its type icons or kind holograms. `count` gives the probe the
 * number of items drawn with their own shape (`__hq.probes.shapes[floor]`).
 */
export function useShapes<T>(floor: "L2" | "L3" | "L4", url: string, group: RefObject<Object3D | null>, count: (items: Record<string, T>) => number) {
  const [items, setItems] = useState(() => (ready.get(url) as Record<string, T> | undefined) ?? null);
  const [done, setDone] = useState(() => ready.has(url));
  // The crossfade weight, written and read per frame (in `useFrame` callbacks), never during render.
  const fade = useRef(ready.has(url) ? 1 : 0);

  useEffect(() => {
    const g = group.current;
    if (!g || ready.has(url)) return;
    let live = true;
    whenDrawn(g, () => {
      sceneProbes.shapes[floor] = { state: "loading", unique: 0 };
      load(url).then(
        () => live && setItems(ready.get(url) as Record<string, T>),
        () => live && (sceneProbes.shapes[floor] = { state: "failed", unique: 0 }),
      );
    });
    return () => {
      live = false;
      forgetDrawn(g);
    };
  }, [floor, url, group]);

  useFrame((_, dt) => {
    if (!items || done) return;
    fade.current = getHQStore().getState().reducedMotion ? 1 : Math.min(1, fade.current + Math.min(dt, 0.1) / 0.6);
    if (fade.current === 1) setDone(true);
  });

  useEffect(() => {
    if (done && items) sceneProbes.shapes[floor] = { state: "shown", unique: count(items) };
    // `count` is read once the shapes show; a new function each render must not rewrite the probe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, items, floor]);

  return { items, fade, done };
}
