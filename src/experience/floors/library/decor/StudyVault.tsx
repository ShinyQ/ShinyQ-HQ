"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, InstancedBufferAttribute, Matrix4, PlaneGeometry, RingGeometry, Sphere, Vector3, type InstancedMesh } from "three";
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
import { bookMatrix, coverMatrix, coverOpen, issuerTone, plinthMatrix, VAULT_SCENE } from "./vault";

const NO_RAYCAST = () => null;
/** Instance brightness: book rims, plinth rims, covers (shut, and added when open), floor pools and the track. */
const LEVEL = { body: 1.15, plinth: 0.6, cover: 0.42, coverOpen: 0.6, pool: 0.3, center: 0.14, track: 0.42 } as const;
const TRACK_COLOR = "#67e8f9";
/** Floor track the plinths stand on: radial half width (u) around the arc, angular margin past the outer books (rad), dashes around a full turn. */
const TRACK = { half: 1.9, margin: 0.22, dashes: 56 } as const;
/** Full-tier light pools: one under each book and a wide dim one under the arc's middle (diameters, u). */
const POOL = { book: 4.6, center: 13 } as const;

/**
 * Draw order: the books (they write depth) and then their covers go before the other transparent passes, so the spine
 * plates (end plaza signs, sorted by their own group's far origin) draw over the covers they stand in front of.
 */
const RENDER_ORDER = { books: -2, covers: -1 } as const;

const M = new Matrix4();
const C = new Color();
const SHIFT = new Matrix4();

/** A floor-local instance matrix relative to the vault plaza's center (the meshes' origin, so transparent sorting sees the vault where it is). */
function local(m: Matrix4, vault: LibraryVault): Matrix4 {
  return m.premultiply(SHIFT.makeTranslation(-vault.center.x, 0, -vault.center.z));
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
  const full = tier === "full";
  const books = vault.books;
  const n = books.length;
  const covers = useRef<InstancedMesh>(null);
  const meshes = useRef<(InstancedMesh | null)[]>([]);
  const open = useRef(new Float32Array(n));
  const ids = useMemo(() => books.map((b) => `L4:vault:${b.slug}`), [books]);
  const tones = useMemo(() => books.map((b) => new Color(issuerTone(b.issuer))), [books]);

  const box = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  useDispose(box);
  // The holo plate reads a per-instance alpha: the books and plinths keep their own box with it.
  const solidGeo = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    g.setAttribute("aAlpha", new InstancedBufferAttribute(new Float32Array(n * 2).fill(1), 1));
    return g;
  }, [n]);
  useDispose(solidGeo);
  const quad = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  useDispose(quad);
  // The arc the books stand on, around the stop: in the ring's own plane (the `ring` mode reads its angle there), laid flat by the instance.
  const span = useMemo(() => {
    const angles = books.map((b) => Math.atan2(b.at.z - vault.stop.z, b.at.x - vault.stop.x));
    return { from: Math.min(...angles) - TRACK.margin, to: Math.max(...angles) + TRACK.margin };
  }, [books, vault.stop]);
  const ringGeo = useMemo(() => {
    const r = NEWSROOM.end.vault.arc;
    // Lying flat turns +y into -z, so the ring's angle runs opposite to the floor's.
    return new RingGeometry(r - TRACK.half, r + TRACK.half, 40, 1, -span.to, span.to - span.from);
  }, [span]);
  useDispose(ringGeo);

  const solidMat = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.plate, color: neonColor("#ffffff", 1.4, tier), depthWrite: true }), [tier]);
  useDispose(solidMat);
  const coverMat = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.core, color: neonColor("#ffffff", 1.6, tier), opacity: full ? 0.85 : 0.7, additive: full }), [tier, full]);
  useDispose(coverMat);
  const trackMat = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.ring, color: neonColor("#ffffff", 1.2, tier), opacity: full ? 0.8 : 0.6, additive: full, params: [TRACK.dashes, 0, 0, 0] }), [tier, full]);
  useDispose(trackMat);
  const poolMat = useMemo(() => (full ? createHoloMaterial({ mode: HOLO_MODE.dot, color: "#ffffff", opacity: 1, params: [reducedMotion ? 0 : 1, 1, 0, 0] }) : null), [full, reducedMotion]);
  useDispose(poolMat);
  const materials = useMemo(() => [solidMat, coverMat, trackMat, ...(poolMat ? [poolMat] : [])], [solidMat, coverMat, trackMat, poolMat]);
  useUniformTime(materials);

  // Books (0 to n - 1) and their plinths (n to 2n - 1): static.
  const solid = useMemo(() => {
    const matrices = new Float32Array(n * 2 * 16);
    const colors = new Float32Array(n * 2 * 3);
    books.forEach((book, i) => {
      local(bookMatrix(book, M), vault).toArray(matrices, i * 16);
      local(plinthMatrix(book, M), vault).toArray(matrices, (n + i) * 16);
      C.set(issuerTone(book.issuer)).multiplyScalar(LEVEL.body).toArray(colors, i * 3);
      C.set(issuerTone(book.issuer)).multiplyScalar(LEVEL.plinth).toArray(colors, (n + i) * 3);
    });
    return { matrices, colors };
  }, [books, n, vault]);
  // Covers start shut; `useFrame` moves them.
  const shut = useMemo(() => {
    const matrices = new Float32Array(n * 16);
    const colors = new Float32Array(n * 3);
    books.forEach((book, i) => {
      local(coverMatrix(book, 0, M), vault).toArray(matrices, i * 16);
      C.set(issuerTone(book.issuer)).multiplyScalar(LEVEL.cover).toArray(colors, i * 3);
    });
    return { matrices, colors };
  }, [books, n, vault]);
  const track = useMemo(() => {
    local(M.makeRotationX(-Math.PI / 2).setPosition(vault.stop.x, 0.03, vault.stop.z), vault);
    return { matrices: new Float32Array(M.elements), colors: new Float32Array(C.set(TRACK_COLOR).multiplyScalar(LEVEL.track).toArray()) };
  }, [vault]);
  const pools = useMemo(() => {
    const count = n + 1;
    const matrices = new Float32Array(count * 16);
    const colors = new Float32Array(count * 3);
    books.forEach((book, i) => {
      local(M.makeScale(POOL.book, 1, POOL.book).setPosition(book.at.x, 0.02, book.at.z), vault).toArray(matrices, i * 16);
      C.set(issuerTone(book.issuer)).multiplyScalar(LEVEL.pool).toArray(colors, i * 3);
    });
    const mid = books.reduce((m, b) => ({ x: m.x + b.at.x / n, z: m.z + b.at.z / n }), { x: 0, z: 0 });
    local(M.makeScale(POOL.center, 1, POOL.center).setPosition(mid.x, 0.015, mid.z), vault).toArray(matrices, n * 16);
    C.set(TRACK_COLOR).multiplyScalar(LEVEL.center).toArray(colors, n * 3);
    return { count, matrices, colors };
  }, [books, n, vault]);

  // One bounding sphere around the whole vault, open covers included, so the meshes cull as one piece.
  const bounds = useMemo(() => {
    const points = books.flatMap((b) => [new Vector3(b.at.x, 0, b.at.z), new Vector3(b.at.x, NEWSROOM.end.vault.book.h + VAULT_SCENE.plinth, b.at.z)]);
    const sphere = new Sphere().setFromPoints([...points, new Vector3(vault.stop.x, 0, vault.stop.z)]);
    sphere.radius += NEWSROOM.end.vault.book.d + TRACK.half;
    sphere.center.x -= vault.center.x;
    sphere.center.z -= vault.center.z;
    return sphere;
  }, [books, vault]);
  useLayoutEffect(() => {
    for (const mesh of meshes.current) if (mesh) mesh.boundingSphere = bounds.clone();
  });

  useEffect(() => {
    sceneProbes.vault.books = books.map((b) => b.slug);
    sceneProbes.vault.open = Array.from(open.current);
    return () => {
      sceneProbes.vault.books = [];
      sceneProbes.vault.open = [];
    };
  }, [books]);

  useFrame((_, dt) => {
    const mesh = covers.current;
    if (!mesh) return;
    const state = getHQStore().getState();
    const here = state.floor === "L4";
    const hovered = state.hover?.item.id;
    const o = open.current;
    const step = Math.min(dt, 0.1) * VAULT_SCENE.rate;
    let changed = false;
    for (let i = 0; i < n; i++) {
      const book = books[i];
      const target = !here ? 0 : hovered === ids[i] ? 1 : coverOpen(Math.hypot(roverRuntime.x - book.at.x, roverRuntime.z - book.at.z));
      const next = reducedMotion ? target : o[i] + Math.max(-step, Math.min(step, target - o[i]));
      if (Math.abs(next - o[i]) < 1e-5) continue;
      o[i] = next;
      changed = true;
      mesh.setMatrixAt(i, local(coverMatrix(book, next, M), vault));
      mesh.setColorAt(i, C.copy(tones[i]).multiplyScalar(LEVEL.cover + LEVEL.coverOpen * next));
      sceneProbes.vault.open[i] = next;
    }
    if (!changed) return;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group name="library-vault" position={[vault.center.x, 0, vault.center.z]}>
      <instancedMesh
        ref={(m) => {
          meshes.current[0] = m;
        }}
        name="library-vault-books"
        args={[solidGeo, solidMat, n * 2]}
        renderOrder={RENDER_ORDER.books}
        raycast={NO_RAYCAST}
      >
        <instancedBufferAttribute attach="instanceMatrix" args={[solid.matrices, 16]} />
        <instancedBufferAttribute attach="instanceColor" args={[solid.colors, 3]} />
      </instancedMesh>
      <instancedMesh
        ref={(m) => {
          covers.current = m;
          meshes.current[1] = m;
        }}
        name="library-vault-covers"
        args={[box, coverMat, n]}
        renderOrder={RENDER_ORDER.covers}
        raycast={NO_RAYCAST}
      >
        <instancedBufferAttribute attach="instanceMatrix" args={[shut.matrices, 16]} />
        <instancedBufferAttribute attach="instanceColor" args={[shut.colors, 3]} />
      </instancedMesh>
      <instancedMesh
        ref={(m) => {
          meshes.current[2] = m;
        }}
        name="library-vault-track"
        args={[ringGeo, trackMat, 1]}
        raycast={NO_RAYCAST}
      >
        <instancedBufferAttribute attach="instanceMatrix" args={[track.matrices, 16]} />
        <instancedBufferAttribute attach="instanceColor" args={[track.colors, 3]} />
      </instancedMesh>
      {poolMat && (
        <instancedMesh
          ref={(m) => {
            meshes.current[3] = m;
          }}
          name="library-vault-pools"
          args={[quad, poolMat, pools.count]}
          raycast={NO_RAYCAST}
        >
          <instancedBufferAttribute attach="instanceMatrix" args={[pools.matrices, 16]} />
          <instancedBufferAttribute attach="instanceColor" args={[pools.colors, 3]} />
        </instancedMesh>
      )}
    </group>
  );
}
