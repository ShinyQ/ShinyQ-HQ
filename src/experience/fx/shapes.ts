"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useState, type RefObject } from "react";
import type { Object3D } from "three";
import { getHQStore } from "@/store/useHQStore";
import { forgetDrawn, whenDrawn } from "../scene/drawnWork";
import { sceneProbes } from "./probes";

type Payload = { items: Record<string, unknown>; icons?: unknown[] };
/** Parsed payload per shapes URL (a revisit mounts with the unique shapes at once) and the fetches in flight. */
const ready = new Map<string, Payload>();
const loads = new Map<string, Promise<Payload>>();
const NONE: unknown[] = [];
type Floor = "L2" | "L3" | "L4";
/** Crossfade weights per floor (one hologram set each), uniform-shaped; they finish fading even across a remount. */
const FADES = Object.fromEntries(["L2", "L3", "L4"].map((f) => [f, { fadeIn: { value: 0 }, fadeOut: { value: 1 } }])) as Record<Floor, { fadeIn: { value: number }; fadeOut: { value: number } }>;

/**
 * A floor's unique hologram shapes (`public/shapes/<floor>.<hash>.json`, `src/content/shapes.ts`): the fetch starts
 * right before the first render that shows `group` (`whenDrawn`), then the unique shapes fade in over 0.6 s while the
 * fallback fades out (`fadeIn.value` and `fadeOut.value`, uniform-shaped so `HoloIcon` reads them straight into its
 * shader; at once under reduced motion), and `done` turns true, when the fallback unmounts. Until then, and on a
 * failed fetch (tried again on the next mount), the floor keeps its type icons or kind holograms.
 * Probe: `__hq.probes.shapes[floor]`.
 */
export function useShapes<T>(floor: Floor, url: string, group: RefObject<Object3D | null>) {
  const [payload, setPayload] = useState(() => ready.get(url) ?? null);
  const items = payload?.items as Record<string, T> | undefined;
  const [done, setDone] = useState(Boolean(items));
  const fade = FADES[floor];

  useEffect(() => {
    const g = group.current;
    if (!g || items) return;
    let live = true;
    whenDrawn(g, () => {
      sceneProbes.shapes[floor] = { state: "loading", unique: 0 };
      let load = loads.get(url);
      if (!load) {
        load = fetch(url)
          .then((r) => r.json())
          .then((j: Payload) => (ready.set(url, j), j));
        loads.set(url, load);
      }
      load.then(
        (j) => live && setPayload(j),
        () => {
          loads.delete(url);
          sceneProbes.shapes[floor] = { state: "failed", unique: 0 };
        },
      );
    });
    return () => {
      live = false;
      forgetDrawn(g);
    };
  }, [floor, url, group, items]);

  useFrame((_, dt) => {
    if (!items || fade.fadeIn.value === 1) return;
    const v = getHQStore().getState().reducedMotion ? 1 : Math.min(1, fade.fadeIn.value + Math.min(dt, 0.1) / 0.6);
    fade.fadeIn.value = v;
    fade.fadeOut.value = 1 - v;
    if (v === 1) setDone(true);
  });

  useEffect(() => {
    if (done && items) sceneProbes.shapes[floor] = { state: "shown", unique: Object.keys(items).length };
  }, [done, items, floor]);

  return { items, icons: payload?.icons ?? NONE, done, ...fade };
}
