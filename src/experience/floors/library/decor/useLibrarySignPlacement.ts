"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Vector3, type Object3D } from "three";
import { getHQStore } from "@/store/useHQStore";
import { sceneProbes } from "../../../fx/probes";
import type { SignSpec } from "../../../fx/signLayout";
import { roverRuntime } from "../../../rover/runtime";
import { createLibraryFrame, libraryLabelFrame, libraryPlateHalves, type LibraryFrame } from "./signFrame";
import type { LibrarySignMeta } from "./signs";
import { endPlazaScreen } from "./useEndSignPlacement";

/**
 * Screen placement of the L4 timeline signs (Round 7 declutter): every frame each sign's plate is projected
 * to the screen and `placeLibraryLabels` decides which show (the picked topic's titles, the live spine read from
 * `sceneProbes.shelves.pulled` as `TrackShelves` writes it, track names, lead titles, then sections, nearest to the
 * rover first, capped per kind), so no label covers another, an end plaza sign or the
 * rover (its bounds projected to the screen count as occupied space). Signs hide when the camera is right
 * under them (`LIBRARY_SIGN.near`). The frame itself is pure (`libraryLabelFrame` in `signFrame.ts`). Fades
 * ease; under reduced motion they cut. Writes `__hq.probes.library.labels` (the shown boxes in CSS pixels) for
 * the rendered overlap test.
 */

const FADE_RATE = 8;

type ProbeLabel = (typeof sceneProbes.library.labels)[number];

export function useLibrarySignPlacement({
  signs,
  meta,
  group,
  reducedMotion,
}: {
  signs: readonly SignSpec[];
  meta: readonly LibrarySignMeta[];
  /** The signs' group (floor origin): its world position, the floor's height included. */
  group: { readonly current: Object3D | null };
  reducedMotion: boolean;
}) {
  const alpha = useRef<Float32Array>(new Float32Array(signs.length));
  // Sized to the sign list in the same commit, zero-filled, before any frame draws it: unplaced signs
  // start hidden (FloatingSigns reads a missing entry as 1, which flashed every sign for one frame).
  useLayoutEffect(() => {
    alpha.current = new Float32Array(signs.length);
  }, [signs]);
  const half = useMemo(() => libraryPlateHalves(signs), [signs]);
  const texts = useMemo(() => signs.map((s) => s.text.replace(/\s+/g, " ")), [signs]);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new Vector3(), []);
  const origin = useMemo(() => new Vector3(), []);
  /** Per-frame scratch (candidates, quads, the plate center), rebuilt when the sign list changes. */
  const scratch = useRef<LibraryFrame>(createLibraryFrame());
  useEffect(
    () => () => {
      sceneProbes.library.labels = [];
      sceneProbes.library.hidden = [];
      sceneProbes.library.rover = null;
    },
    [],
  );

  useFrame(({ camera }, dt) => {
    if (!group.current || meta.length !== signs.length) return;
    const work = scratch.current;
    group.current.getWorldPosition(origin);
    const { shown, rover } = libraryLabelFrame(work, {
      camera,
      signs,
      meta,
      half,
      origin,
      rover: roverRuntime,
      rooms: getHQStore().getState().topics.topic?.rooms,
      live: sceneProbes.shelves.pulled,
      size,
      endBoxes: endPlazaScreen.boxes,
      v,
    });
    const { labels, quads } = work;
    // A new sign list starts hidden and fades in where it fits.
    const a = alpha.current;
    const k = reducedMotion ? 1 : Math.min(1, dt * FADE_RATE);
    const probe: ProbeLabel[] = [];
    const hidden: (typeof sceneProbes.library.hidden)[number][] = [];
    for (let i = 0; i < signs.length; i++) {
      a[i] += ((shown[i] ? 1 : 0) - a[i]) * k;
      const box = labels[i].box;
      const quad = quads[i];
      if (shown[i] && box && quad && a[i] > 0.5) probe.push({ text: texts[i], kind: meta[i].kind, ...box, quad });
      else if (!shown[i] && box) hidden.push({ text: texts[i], kind: meta[i].kind, ...box });
    }
    sceneProbes.library.labels = probe;
    sceneProbes.library.hidden = hidden;
    sceneProbes.library.rover = rover ? { ...rover } : null;
  });

  return alpha;
}
