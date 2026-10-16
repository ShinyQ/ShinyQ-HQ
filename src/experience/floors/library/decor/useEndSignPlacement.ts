"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Vector3, type Object3D } from "three";
import { placeLabels, type LabelCandidate, type ScreenBox } from "../../../fx/labelPlacement";
import { projectPlate } from "../../../fx/plateProjection";
import { sceneProbes } from "../../../fx/probes";
import { orbitXZ, signPlate, type SignSpec } from "../../../fx/signLayout";
import type { EndSignMeta } from "./EndPlaza";

/**
 * Label placement of the end plaza's signs (owner review 2026-10-14): every frame each sign's plate is
 * projected to the screen and `placeLabels` keeps the shown ones apart. The count headline, the monument
 * plates, the archive name and the picked topic always show; the other topic labels show by priority
 * (hovered, then bigger topics, then nearer ones) up to `LABEL_MAX` and only where they cover nothing.
 * Signs fade out when the camera is right under them (`NEAR`). Fades ease; under reduced motion they cut.
 * Writes `__hq.probes.topics.labels` (the shown boxes in CSS pixels) for the overlap test.
 */

/** Free topic labels shown at once: desktop, phone. */
export const LABEL_MAX = { wide: 8, narrow: 5 } as const;
/** Horizontal camera distance (u) under which a sign hides: it would fill the screen. */
const NEAR: Record<EndSignMeta["kind"], number> = { topic: 8, count: 11, monument: 0, archive: 0 };
/** A small margin around each plate. */
const BOX_PAD = 1.04;
const FADE_RATE = 8;

/** Screen boxes of the end plaza signs shown this frame, so the L4 timeline signs keep clear of them (`useLibrarySignPlacement`). */
export const endPlazaScreen = { boxes: [] as ScreenBox[] };

export function useEndSignPlacement({
  signs,
  meta,
  group,
  angle,
  hovered,
  reducedMotion,
  obstacles = [],
}: {
  signs: readonly SignSpec[];
  meta: readonly EndSignMeta[];
  /** The signs' group (plaza center): its world position, the floor's height included. */
  group: { readonly current: Object3D | null };
  angle: { readonly current: number };
  hovered: { readonly current: string | null };
  reducedMotion: boolean;
  /** Solid shapes no label may cover (the glowing pedestal), as floor-local boxes around the group origin. */
  obstacles?: readonly { x: number; z: number; r: number; h: number }[];
}) {
  const alpha = useRef<Float32Array>(new Float32Array(0));
  const sizes = useMemo(() => signs.map(signPlate), [signs]);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new Vector3(), []);
  const origin = useMemo(() => new Vector3(), []);
  useEffect(
    () => () => {
      sceneProbes.topics.labels = [];
      endPlazaScreen.boxes = [];
    },
    [],
  );

  useFrame(({ camera }, dt) => {
    const { width, height } = size;
    if (!group.current) return;
    group.current.getWorldPosition(origin);
    const quads: [number, number][][] = [];
    const candidates: LabelCandidate[] = signs.map((s, i) => {
      const m = meta[i];
      const local = s.orbit ? orbitXZ(s.x, s.z, angle.current) : { x: s.x, z: s.z };
      const wx = origin.x + local.x;
      const wz = origin.z + local.z;
      const d = Math.hypot(camera.position.x - wx, camera.position.z - wz);
      const fixed = m.kind !== "topic" || Boolean(m.picked);
      if (d < NEAR[m.kind]) return { box: null, priority: 0, fixed };
      const projected = projectPlate(camera, { x: wx, y: origin.y + s.y, z: wz }, { w: (sizes[i].w / 2) * BOX_PAD, h: (sizes[i].h / 2) * BOX_PAD }, size, v);
      if (!projected) return { box: null, priority: 0, fixed };
      quads[i] = projected.quad;
      if (!projected.onScreen) return { box: null, priority: 0, fixed };
      const box = projected.box;
      const priority = m.kind !== "topic" ? 0 : (hovered.current === m.slug ? 1000 : 0) + (m.count ?? 0) * 10 + 50 / (1 + d);
      return { box, priority, fixed };
    });
    // Obstacles take their screen box first (fixed, never drawn), so no label sits over them.
    for (const o of obstacles) {
      const box: ScreenBox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      let seen = true;
      for (const dx of [-o.r, o.r])
        for (const dz of [-o.r, o.r])
          for (const y of [0, o.h]) {
            v.set(origin.x + o.x + dx, origin.y + y, origin.z + o.z + dz).project(camera);
            if (v.z < -1 || v.z > 1) seen = false;
            const x = ((v.x + 1) / 2) * width;
            const sy = ((1 - v.y) / 2) * height;
            box.x0 = Math.min(box.x0, x);
            box.x1 = Math.max(box.x1, x);
            box.y0 = Math.min(box.y0, sy);
            box.y1 = Math.max(box.y1, sy);
          }
      candidates.push({ box: seen ? box : null, priority: 0, fixed: true });
    }
    const shown = placeLabels(candidates, width < 600 ? LABEL_MAX.narrow : LABEL_MAX.wide);
    const screen: ScreenBox[] = [];
    for (let i = 0; i < signs.length; i++) {
      const box = candidates[i].box;
      if (shown[i] && box) screen.push(box);
    }
    endPlazaScreen.boxes = screen;
    // A new sign list (a pick) starts hidden and fades in where it fits.
    if (alpha.current.length !== signs.length) alpha.current = new Float32Array(signs.length);
    const a = alpha.current;
    const k = reducedMotion ? 1 : Math.min(1, dt * FADE_RATE);
    const probe: { text: string; kind: string; x0: number; y0: number; x1: number; y1: number; quad: [number, number][] }[] = [];
    for (let i = 0; i < signs.length; i++) {
      const target = shown[i] ? 1 : 0;
      a[i] += (target - a[i]) * k;
      const box = candidates[i].box;
      if (shown[i] && box && a[i] > 0.5) probe.push({ text: signs[i].text.replace(/\s+/g, " "), kind: meta[i].kind, ...box, quad: quads[i] });
    }
    sceneProbes.topics.labels = probe;
  });

  return alpha;
}
