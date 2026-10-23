"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useState, type RefObject } from "react";
import type { Object3D } from "three";
import { loadJson, peekJson } from "@/lib/json-cache";
import { forgetDrawn, whenDrawn } from "../scene/drawnWork";
import type { HoloIconInstance } from "./HoloIcon";

/** A floor's shapes file: L3 pod slug to sculpture (`items`), L2 and L4 the item icons placed at build (`icons`). */
export type Shapes<T> = { items?: Record<string, T>; icons?: HoloIconInstance[] };
type Floor = "L2" | "L3" | "L4";
const weights = () => ({ fadeIn: { value: 0 }, fadeOut: { value: 1 } });
/** Crossfade weights per floor (one hologram set each), uniform-shaped; they finish fading even across a remount. */
const FADES = { L2: weights(), L3: weights(), L4: weights() };

/**
 * A floor's unique hologram shapes (`public/shapes/<floor>.<hash>.json`, `src/content/shapes.ts`): the fetch starts
 * right before the first render that shows `group` (`whenDrawn`), then the unique shapes fade in over 0.6 s while the
 * fallback fades out (`fadeIn.value` and `fadeOut.value`, uniform-shaped so `HoloIcon` reads them straight into its
 * shader; at once under reduced motion), and `done` turns true, when the fallback unmounts. Until then, and on a
 * failed fetch (tried again on the next mount), the floor keeps its type icons or kind holograms.
 */
export function useShapes<T>(floor: Floor, url: string, group: RefObject<Object3D | null>, reducedMotion: boolean) {
  const [data, setData] = useState(() => peekJson<Shapes<T>>(url));
  const [done, setDone] = useState(Boolean(data));

  useEffect(() => {
    const g = group.current;
    if (!g || data) return;
    // A failed fetch keeps the fallback; the next mount tries again.
    whenDrawn(g, () => void loadJson<Shapes<T>>(url).then(setData, () => 0));
    return () => forgetDrawn(g);
  }, [url, group, data]);

  useFrame((_, dt) => {
    const fade = FADES[floor];
    if (!data || fade.fadeIn.value === 1) return;
    const v = reducedMotion ? 1 : Math.min(1, fade.fadeIn.value + Math.min(dt, 0.1) / 0.6);
    fade.fadeIn.value = v;
    fade.fadeOut.value = 1 - v;
    if (v === 1) setDone(true);
  });

  return { data, done, ...FADES[floor] };
}
