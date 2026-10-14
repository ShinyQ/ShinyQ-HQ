"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Vector3, type Object3D } from "three";
import { placeLabels, type LabelCandidate, type ScreenBox } from "../../../fx/labelPlacement";
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
/** Plate corners in order around the plate (left bottom, right bottom, right top, left top). */
const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

export function useEndSignPlacement({
  signs,
  meta,
  group,
  angle,
  hovered,
  reducedMotion,
}: {
  signs: readonly SignSpec[];
  meta: readonly EndSignMeta[];
  /** The signs' group (plaza center): its world position, the floor's height included. */
  group: { readonly current: Object3D | null };
  angle: { readonly current: number };
  hovered: { readonly current: string | null };
  reducedMotion: boolean;
}) {
  const alpha = useRef<Float32Array>(new Float32Array(0));
  const sizes = useMemo(() => signs.map(signPlate), [signs]);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);
  const origin = useMemo(() => new Vector3(), []);
  useEffect(
    () => () => {
      sceneProbes.topics.labels = [];
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
      // Plates turn to the camera about y only and stay upright (`signFacing`): their screen box spans the
      // four corners along the horizontal axis square to the camera direction and the world vertical.
      right.set(camera.position.z - wz, 0, wx - camera.position.x).divideScalar(d);
      const hw = (sizes[i].w / 2) * BOX_PAD;
      const hh = (sizes[i].h / 2) * BOX_PAD;
      const box: ScreenBox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      const quad: [number, number][] = [];
      for (const [sx, sy] of CORNERS) {
        {
          v.set(wx + right.x * hw * sx, origin.y + s.y + hh * sy, wz + right.z * hw * sx).project(camera);
          if (v.z < -1 || v.z > 1) return { box: null, priority: 0, fixed };
          const x = ((v.x + 1) / 2) * width;
          const y = ((1 - v.y) / 2) * height;
          box.x0 = Math.min(box.x0, x);
          box.x1 = Math.max(box.x1, x);
          box.y0 = Math.min(box.y0, y);
          box.y1 = Math.max(box.y1, y);
          quad.push([x, y]);
        }
      }
      quads[i] = quad;
      if (box.x1 < 0 || box.x0 > width || box.y1 < 0 || box.y0 > height) return { box: null, priority: 0, fixed };
      const priority = m.kind !== "topic" ? 0 : (hovered.current === m.slug ? 1000 : 0) + (m.count ?? 0) * 10 + 50 / (1 + d);
      return { box, priority, fixed };
    });
    const shown = placeLabels(candidates, width < 600 ? LABEL_MAX.narrow : LABEL_MAX.wide);
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
