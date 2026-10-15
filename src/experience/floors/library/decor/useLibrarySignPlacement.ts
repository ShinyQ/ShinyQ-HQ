"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Vector3, type Object3D } from "three";
import { getHQStore } from "@/store/useHQStore";
import { projectPlate } from "../../../fx/plateProjection";
import { sceneProbes } from "../../../fx/probes";
import { signPlate, type SignSpec } from "../../../fx/signLayout";
import { roverRuntime } from "../../../rover/runtime";
import { placeLibraryLabels, type LibraryLabel } from "../signPlacement";
import type { LibrarySignMeta } from "./signs";
import { endPlazaScreen } from "./useEndSignPlacement";

/**
 * Screen placement of the L4 timeline signs (Round 7 declutter): every frame each sign's plate is projected
 * to the screen and `placeLibraryLabels` decides which show (picked titles, sections, years, then the
 * nearest titles to the rover, capped per kind), so no label covers another or an end plaza sign. Signs
 * hide when the camera is right under them (`NEAR`). Fades ease; under reduced motion they cut. Writes
 * `__hq.probes.library.labels` (the shown boxes in CSS pixels) for the overlap test.
 */

/** Horizontal camera distance (u) under which a sign hides: it would fill the screen. */
const NEAR = 6;
/** A small margin around each plate. */
const BOX_PAD = 1.04;
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
  const alpha = useRef<Float32Array>(new Float32Array(0));
  const half = useMemo(
    () =>
      signs.map((s) => {
        const p = signPlate(s);
        return { w: (p.w / 2) * BOX_PAD, h: (p.h / 2) * BOX_PAD };
      }),
    [signs],
  );
  const texts = useMemo(() => signs.map((s) => s.text.replace(/\s+/g, " ")), [signs]);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new Vector3(), []);
  const origin = useMemo(() => new Vector3(), []);
  /** Per-frame scratch (candidates, quads, the plate center), rebuilt when the sign list changes. */
  const scratch = useRef<{ meta: readonly LibrarySignMeta[] | null; labels: LibraryLabel[]; quads: ([number, number][] | null)[]; at: { x: number; y: number; z: number } }>({
    meta: null,
    labels: [],
    quads: [],
    at: { x: 0, y: 0, z: 0 },
  });
  useEffect(
    () => () => {
      sceneProbes.library.labels = [];
    },
    [],
  );

  useFrame(({ camera }, dt) => {
    if (!group.current || meta.length !== signs.length) return;
    const work = scratch.current;
    if (work.meta !== meta) {
      work.meta = meta;
      work.labels = meta.map((m) => ({ kind: m.kind, box: null, distance: 0, picked: false }));
      work.quads = meta.map(() => null);
    }
    const { labels, quads, at } = work;
    group.current.getWorldPosition(origin);
    const rooms = getHQStore().getState().topics.topic?.rooms;
    for (let i = 0; i < signs.length; i++) {
      const s = signs[i];
      const m = meta[i];
      const label = labels[i];
      at.x = origin.x + s.x;
      at.y = origin.y + s.y;
      at.z = origin.z + s.z;
      label.distance = Math.hypot(roverRuntime.x - at.x, roverRuntime.z - at.z);
      label.picked = m.kind === "title" && Boolean(m.room && rooms?.includes(m.room));
      label.box = null;
      quads[i] = null;
      if (Math.hypot(camera.position.x - at.x, camera.position.z - at.z) < NEAR) continue;
      const projected = projectPlate(camera, at, half[i], size, v);
      if (!projected || !projected.onScreen) continue;
      label.box = projected.box;
      quads[i] = projected.quad;
    }
    const shown = placeLibraryLabels(labels, { narrow: size.width < 600, fixed: endPlazaScreen.boxes });
    // A new sign list starts hidden and fades in where it fits.
    if (alpha.current.length !== signs.length) alpha.current = new Float32Array(signs.length);
    const a = alpha.current;
    const k = reducedMotion ? 1 : Math.min(1, dt * FADE_RATE);
    const probe: ProbeLabel[] = [];
    for (let i = 0; i < signs.length; i++) {
      a[i] += ((shown[i] ? 1 : 0) - a[i]) * k;
      const box = labels[i].box;
      const quad = quads[i];
      if (shown[i] && box && quad && a[i] > 0.5) probe.push({ text: texts[i], kind: meta[i].kind, ...box, quad });
    }
    sceneProbes.library.labels = probe;
  });

  return alpha;
}
