"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Vector3, type Object3D } from "three";
import type { ScreenBox } from "../../../fx/labelPlacement";
import { sceneProbes } from "../../../fx/probes";
import { roverRuntime } from "../../../rover/runtime";
import type { Vec2 } from "../../../types";
import { signPlate, type SignSpec } from "../../../fx/signLayout";
import type { EndSignMeta } from "./EndPlaza";
import { endPlazaFrame, vaultZone } from "./signFrame";

/**
 * Label placement of the end plaza's signs (owner review 2026-10-14): every frame each sign's plate is
 * projected to the screen and `placeLabels` keeps the shown ones apart. The count headline, the monument
 * plates, the archive name and the picked topic always show; the other topic labels show by priority
 * (hovered, then bigger topics, then nearer ones) up to `END_LABEL_MAX` and only where they cover nothing.
 * Signs fade out when the camera is right under them (`END_SIGN_NEAR`); the frame itself is pure
 * (`endPlazaFrame` in `signFrame.ts`). Fades ease; under reduced motion they cut.
 * The Study Vault's signs outrank the topic labels while the rover stands in the vault plaza and show only near it (`vaultZone`).
 * Writes `__hq.probes.topics.labels` (the shown boxes in CSS pixels) for the overlap test and
 * `__hq.probes.vault.spines` (the spines shown).
 */

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
  vault = null,
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
  /** The Study Vault's plaza (floor-local), if any. */
  vault?: { center: Vec2; radius: number; entry: Vec2 } | null;
}) {
  const alpha = useRef<Float32Array>(new Float32Array(0));
  const sizes = useMemo(() => signs.map(signPlate), [signs]);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new Vector3(), []);
  const origin = useMemo(() => new Vector3(), []);
  useEffect(
    () => () => {
      sceneProbes.topics.labels = [];
      sceneProbes.vault.spines = 0;
      endPlazaScreen.boxes = [];
    },
    [],
  );

  useFrame(({ camera }, dt) => {
    if (!group.current) return;
    group.current.getWorldPosition(origin);
    const { candidates, quads, shown, boxes } = endPlazaFrame({ camera, signs, sizes, meta, origin, angle: angle.current, hovered: hovered.current, obstacles, size, v, vault: vaultZone(roverRuntime, vault) });
    endPlazaScreen.boxes = boxes;
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
    sceneProbes.vault.spines = probe.filter((p) => p.kind === "guide").length;
  });

  return alpha;
}
