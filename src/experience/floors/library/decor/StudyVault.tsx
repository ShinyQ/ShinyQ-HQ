"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, InstancedBufferAttribute, InstancedMesh, MathUtils, Matrix4, PlaneGeometry, RingGeometry, Sphere, Vector3, type BufferGeometry, type ShaderMaterial } from "three";
import { getHQStore } from "@/store/useHQStore";
import { createHoloMaterial, HOLO_MODE } from "../../../fx/holoFx";
import { neonColor } from "../../../fx/materials";
import { sceneProbes } from "../../../fx/probes";
import { useDispose } from "../../../fx/useDispose";
import { useUniformTime } from "../../../fx/useUniformTime";
import { roverRuntime } from "../../../rover/runtime";
import type { GpuTier } from "../../../types";
import { NEWSROOM } from "../concepts/newsroom";
import type { LibraryVault } from "../model";
import { bookMatrix, coverMatrix, coverOpen, issuerTone, plinthMatrix } from "./vault";

const NO_RAYCAST = () => null;
/** Instance brightness: book rims, plinth rims, covers (shut, and added when open), floor pools and the track. */
const LEVEL = { body: 1.15, plinth: 0.6, cover: 0.42, coverOpen: 0.6, pool: 0.3, center: 0.14, track: 0.42 };
const TRACK_COLOR = "#67e8f9";
/** Floor track the plinths stand on: radial half width (u) around the arc, angular margin past the outer books (rad), dashes around a full turn. */
const TRACK = { half: 1.9, margin: 0.22, dashes: 56 };
/** Full-tier light pools: one under each book and a wide dim one under the arc's middle (diameters, u). */
const POOL = { book: 4.6, center: 13 };
/** How fast a cover moves toward its target (share of the full travel per second); reduced motion snaps. */
const COVER_RATE = 1.6;

const M = new Matrix4();
const C = new Color();

/** One instance: its floor-local matrix, tone and brightness. */
type Item = [Matrix4, string, number];

/**
 * The vault's meshes (books and plinths, covers, the floor track and, on full only, the light pools), their instances
 * relative to the vault plaza's center (the group's origin, so transparent sorting sees the vault where it is), all
 * culled by one bounding sphere around the whole vault, open covers included. Draw order: the books (they write depth)
 * and then their covers go before the other transparent passes, so the spine plates (end plaza signs, sorted by their
 * own group's far origin) draw over the covers they stand in front of.
 */
function vaultMeshes(vault: LibraryVault, tier: GpuTier, reducedMotion: boolean) {
  const full = tier === "full";
  const { books, stop, center } = vault;
  const n = books.length;
  const V = NEWSROOM.end.vault;
  const shift = new Matrix4().makeTranslation(-center.x, 0, -center.z);
  const mid = books.reduce((m, b) => ({ x: m.x + b.at.x / n, z: m.z + b.at.z / n }), { x: 0, z: 0 });
  // Around the books' middle, wide enough for the track's ends (the farthest piece).
  const bounds = new Sphere(new Vector3(mid.x - center.x, 2, mid.z - center.z), V.arc + TRACK.half);
  const mesh = (geometry: BufferGeometry, material: ShaderMaterial, items: Item[], order = 0) => {
    const m = new InstancedMesh(geometry, material, items.length);
    items.forEach(([matrix, color, level], i) => {
      m.setMatrixAt(i, matrix.premultiply(shift));
      m.setColorAt(i, C.set(color).multiplyScalar(level));
    });
    m.renderOrder = order;
    m.boundingSphere = bounds;
    m.raycast = NO_RAYCAST;
    return m;
  };
  // The holo plate reads a per-instance alpha (all 1); the covers' `core` mode ignores it, so they share the box.
  const box = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0).setAttribute("aAlpha", new InstancedBufferAttribute(new Float32Array(n * 2).fill(1), 1));
  // The arc the books stand on, around the stop (centered due east of it): in the ring's own plane, laid flat by the instance.
  const span = ((n - 1) / 2) * (V.spacing / V.arc) + TRACK.margin;
  const tones = books.map((b) => issuerTone(b.issuer));
  const meshes = [
    mesh(box, createHoloMaterial({ mode: HOLO_MODE.plate, color: neonColor("#ffffff", 1.4, tier), depthWrite: true }), [
      ...books.map((b, i): Item => [bookMatrix(b, new Matrix4()), tones[i], LEVEL.body]),
      ...books.map((b, i): Item => [plinthMatrix(b, new Matrix4()), tones[i], LEVEL.plinth]),
    ], -2),
    // Covers start shut; `useFrame` moves them.
    mesh(box, createHoloMaterial({ mode: HOLO_MODE.core, color: neonColor("#ffffff", 1.6, tier), opacity: full ? 0.85 : 0.7, additive: full }), books.map((b, i): Item => [coverMatrix(b, 0, new Matrix4()), tones[i], LEVEL.cover]), -1),
    mesh(
      new RingGeometry(V.arc - TRACK.half, V.arc + TRACK.half, 40, 1, -span, span * 2),
      createHoloMaterial({ mode: HOLO_MODE.ring, color: neonColor("#ffffff", 1.2, tier), opacity: full ? 0.8 : 0.6, additive: full, params: [TRACK.dashes, 0, 0, 0] }),
      [[new Matrix4().makeRotationX(-Math.PI / 2).setPosition(stop.x, 0.03, stop.z), TRACK_COLOR, LEVEL.track]],
    ),
  ];
  if (full) {
    meshes.push(
      mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), createHoloMaterial({ mode: HOLO_MODE.dot, params: [reducedMotion ? 0 : 1, 1, 0, 0] }), [
        ...books.map((b, i): Item => [new Matrix4().makeScale(POOL.book, 1, POOL.book).setPosition(b.at.x, 0.02, b.at.z), tones[i], LEVEL.pool]),
        [new Matrix4().makeScale(POOL.center, 1, POOL.center).setPosition(mid.x, 0.015, mid.z), TRACK_COLOR, LEVEL.center],
      ]),
    );
  }
  const materials = meshes.map((m) => m.material as ShaderMaterial);
  return {
    meshes,
    materials,
    shift,
    ids: books.map((b) => `L4:vault:${b.slug}`),
    tones,
    // The meshes are primitives (R3F leaves them alone): their instance buffers, geometries and materials go here.
    dispose: () => meshes.forEach((m, i) => (m.dispose(), m.geometry.dispose(), materials[i].dispose())),
  };
}

/**
 * The L4 Study Vault (owner request 2026-10-19): the certification study guides as tall holo books on low plinths
 * along an arc east of the stop, in their issuers' tones. Each book's cover (on its right as seen from the stop) slides
 * out and swings open, brightening, as the rover comes near (`coverOpen`) or while point-and-go hovers that book; the
 * spines and the "Study Vault" sign are words, so they ride the end plaza's `FloatingSigns` group. Draw calls: books
 * and plinths 1 (holo `plate`), covers 1 (holo `core`), the floor track 1 (holo `ring`) and, on full only, the light
 * pools 1 (holo `dot`): shared holo program. Lite drops the pools and additive blending; reduced motion snaps the
 * covers to their target and holds the bands, the dashes and the pulse. Not raycast: the books are point-and-go
 * targets (`L4:vault:<slug>`, interact/registry.ts). Writes `__hq.probes.vault` (`books`, `open`).
 */
export function StudyVault({ vault, tier, reducedMotion }: { vault: LibraryVault; tier: GpuTier; reducedMotion: boolean }) {
  const { books, center } = vault;
  const covers = useRef<InstancedMesh>(null);
  const open = useRef(new Float32Array(books.length));
  const kit = useMemo(() => vaultMeshes(vault, tier, reducedMotion), [vault, tier, reducedMotion]);
  useDispose(kit);
  useUniformTime(kit.materials);

  // New meshes start with their covers shut: so do the cover states.
  useEffect(() => {
    open.current.fill(0);
    sceneProbes.vault.books = books.map((b) => b.slug);
    sceneProbes.vault.open = Array.from(open.current);
    return () => {
      sceneProbes.vault.books = [];
      sceneProbes.vault.open = [];
    };
  }, [books, kit]);

  useFrame((_, dt) => {
    const mesh = covers.current;
    if (!mesh) return;
    const state = getHQStore().getState();
    const o = open.current;
    const step = Math.min(dt, 0.1) * COVER_RATE;
    let changed = false;
    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      const target = state.floor !== "L4" ? 0 : state.hover?.item.id === kit.ids[i] ? 1 : coverOpen(Math.hypot(roverRuntime.x - book.at.x, roverRuntime.z - book.at.z));
      const next = reducedMotion ? target : o[i] + MathUtils.clamp(target - o[i], -step, step);
      if (Math.abs(next - o[i]) < 1e-5) continue;
      o[i] = sceneProbes.vault.open[i] = next;
      changed = true;
      mesh.setMatrixAt(i, coverMatrix(book, next, M).premultiply(kit.shift));
      mesh.setColorAt(i, C.set(kit.tones[i]).multiplyScalar(LEVEL.cover + LEVEL.coverOpen * next));
    }
    if (!changed) return;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  });

  return (
    <group name="library-vault" position={[center.x, 0, center.z]}>
      {kit.meshes.map((m, i) => (
        <primitive key={i} ref={i === 1 ? covers : undefined} object={m} />
      ))}
    </group>
  );
}
