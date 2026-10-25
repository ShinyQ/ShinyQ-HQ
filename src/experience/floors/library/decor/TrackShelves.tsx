"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, MathUtils, Matrix4, type InstancedMesh } from "three";
import { getHQStore } from "@/store/useHQStore";
import { sceneProbes } from "../../../fx/probes";
import { useDispose } from "../../../fx/useDispose";
import { useUniformTime } from "../../../fx/useUniformTime";
import { roverRuntime } from "../../../rover/runtime";
import type { GpuTier } from "../../../types";
import { roomOfPost, ZONE_TONE, type LibraryBay } from "../model";
import { bookKit, kitBodies, kitBox, kitCovers, kitPools, type KitItem, type KitMesh } from "./bookKit";
import { bayZone, frameMatrices, leadMatrix, pickSpine, SHELF_SCENE, spineMatrix } from "./shelf3d";

/** Instance brightness: spines (and lead bodies), a topic's spines, added when pulled, frames, lead covers, pools. */
const LEVEL = { spine: 1.15, lit: 1.6, pull: 0.45, frame: 0.6, cover: 1, pool: 0.3 };
const TONE = ZONE_TONE.track;
/** Full-tier light pool diameter under each lead (u), as under a vault book. */
const POOL = 4.6;

const M = new Matrix4();
const C = new Color();

/**
 * The track shelves' meshes on the shared book kit, each spanning every bay: the bodies (the spines, then the leads'
 * bodies, then each bay's row boards and back panel; holo `plate`), the leads' covers held half open (holo `core`) and,
 * on full only, a light pool under each lead (holo `dot`). Relative to the center of all the bays (the group's origin).
 * `posts` lists the bodies in instance order, the `spines` (non-lead) first.
 */
export function shelfMeshes(bays: readonly LibraryBay[], tier: GpuTier, reducedMotion: boolean) {
  const posts = [...bays.flatMap((bay) => bay.slots.slice(1).map((slot) => ({ slot, bay, zone: bayZone(bay) }))), ...bays.map((bay) => ({ slot: bay.slots[0], bay, zone: bayZone(bay) }))];
  const body = [
    ...posts.map(({ slot, bay }): KitItem => [spineMatrix(slot, 0, bay.facing, new Matrix4()), TONE, LEVEL.spine]),
    ...bays.flatMap((bay) => frameMatrices(bay).map((m): KitItem => [m, TONE, LEVEL.frame])),
  ];
  const box = kitBox(body.length);
  const parts: KitMesh[] = [kitBodies(box, body, tier), kitCovers(box, bays.map((b): KitItem => [leadMatrix(b.slots[0], 0.5, b.facing, new Matrix4()), TONE, LEVEL.cover]), tier)];
  if (tier === "full") parts.push(kitPools(bays.map(({ slots: [l] }): KitItem => [new Matrix4().makeScale(POOL, 1, POOL).setPosition(l.at.x, 0.02, l.at.z), TONE, LEVEL.pool]), reducedMotion));
  const x = bays.flatMap((b) => [b.rect.minX, b.rect.maxX]);
  const z = bays.flatMap((b) => [b.rect.minZ, b.rect.maxZ]);
  const origin = { x: (Math.min(...x) + Math.max(...x)) / 2, z: (Math.min(...z) + Math.max(...z)) / 2 };
  const spines = posts.length - bays.length;
  return { ...bookKit(parts, origin), origin, posts, spines, live: posts.slice(0, spines), rooms: posts.map((p) => roomOfPost(p.slot.slug)) };
}

/**
 * The L4 reader track shelves: per bay, the lead post as a tall book with its cover held half open and the other posts
 * as spines on row boards in front of a back panel, in the track tone. The hovered spine (point-and-go
 * `L4:shelf:<slug>`), else the spine nearest the rover inside its bay zone, slides out toward the road and brightens; a
 * picked topic brightens its posts' spines. Draw calls: bodies 1 (holo `plate`), covers 1 (holo `core`) and, on full
 * only, the pools 1 (holo `dot`): the shared holo program. Lite drops the pools and additive blending; reduced motion
 * snaps the pull. Not raycast (interact/registry.ts picks). Writes `__hq.probes.shelves` (`bays`, `spines`, `pulled`).
 */
export function TrackShelves({ bays, tier, reducedMotion }: { bays: readonly LibraryBay[]; tier: GpuTier; reducedMotion: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const kit = useMemo(() => shelfMeshes(bays, tier, reducedMotion), [bays, tier, reducedMotion]);
  const state = useRef({ pull: new Float64Array(0), level: new Float64Array(0) });
  useDispose(kit);
  useUniformTime(kit.materials);

  // New meshes start with every spine in, unlit.
  useEffect(() => {
    state.current = { pull: new Float64Array(kit.posts.length), level: new Float64Array(kit.posts.length).fill(LEVEL.spine) };
    sceneProbes.shelves = { bays: bays.map((b) => b.track), spines: kit.spines, pulled: null };
    return () => void (sceneProbes.shelves = { bays: [], spines: 0, pulled: null });
  }, [bays, kit]);

  useFrame((_, dt) => {
    const mesh = ref.current;
    const { pull, level } = state.current;
    if (!mesh || pull.length !== kit.posts.length) return;
    const store = getHQStore().getState();
    const rooms = store.topics.topic?.rooms;
    const pick = store.floor === "L4" ? pickSpine(kit.live, store.hover?.item.id, roverRuntime.x, roverRuntime.z) : -1;
    const step = reducedMotion ? 1 : Math.min(dt, 0.1) * SHELF_SCENE.rate;
    let changed = false;
    kit.posts.forEach(({ slot, bay }, i) => {
      const p = pull[i] + MathUtils.clamp((i === pick ? 1 : 0) - pull[i], -step, step);
      const l = (rooms?.includes(kit.rooms[i]) ? LEVEL.lit : LEVEL.spine) + LEVEL.pull * p;
      if (p !== pull[i]) {
        changed = true;
        mesh.setMatrixAt(i, spineMatrix(slot, (pull[i] = p), bay.facing, M).premultiply(kit.shift));
      }
      if (l !== level[i]) {
        changed = true;
        mesh.setColorAt(i, C.set(TONE).multiplyScalar((level[i] = l)));
      }
    });
    sceneProbes.shelves.pulled = pick < 0 ? null : kit.rooms[pick];
    if (!changed) return;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  });

  return (
    <group name="library-shelves" position={[kit.origin.x, 0, kit.origin.z]}>
      {kit.meshes.map((m, i) => (
        <primitive key={i} ref={i ? undefined : ref} object={m} />
      ))}
    </group>
  );
}
