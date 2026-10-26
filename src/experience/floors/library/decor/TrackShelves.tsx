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
import { bookKit, kitBodies, kitBox, kitCovers, type KitItem } from "./bookKit";
import { baySlots } from "../slots";
import { bayZone, frameMatrices, leadMatrix, pickSpine, SHELF_SCENE, spineMatrix } from "./shelf3d";

/** Instance brightness: spines (and lead bodies), added when pulled, frames, lead covers. */
const LEVEL = { spine: 1.15, pull: 0.45, frame: 0.6, cover: 1 };
const TONE = ZONE_TONE.track;

const M = new Matrix4();
const C = new Color();

/**
 * The track shelves' meshes on the shared book kit, each spanning every bay: the bodies (the spines, then the leads'
 * bodies, then each bay's row boards and back panel; holo `plate`) and the leads' covers held half open (holo `core`).
 * Relative to the center of all the bays (the group's origin).
 * `posts` lists the bodies in instance order, the `spines` (non-lead) first.
 */
export function shelfMeshes(bays: readonly LibraryBay[], tier: GpuTier) {
  const posts = [...bays.flatMap((bay) => baySlots(bay).slice(1).map((slot) => ({ slot, bay, zone: bayZone(bay) }))), ...bays.map((bay) => ({ slot: baySlots(bay)[0], bay, zone: bayZone(bay) }))];
  const body = [
    ...posts.map(({ slot, bay }): KitItem => [spineMatrix(slot, 0, bay.facing, new Matrix4()), TONE, LEVEL.spine]),
    ...bays.flatMap((bay) => frameMatrices(bay).map((m): KitItem => [m, TONE, LEVEL.frame])),
  ];
  const box = kitBox(body.length);
  const parts = [kitBodies(box, body, tier), kitCovers(box, bays.map((b): KitItem => [leadMatrix(baySlots(b)[0], 0.5, b.facing, new Matrix4()), TONE, LEVEL.cover]), tier)];
  const x = bays.flatMap((b) => [b.rect.minX, b.rect.maxX]);
  const z = bays.flatMap((b) => [b.rect.minZ, b.rect.maxZ]);
  const origin = { x: (Math.min(...x) + Math.max(...x)) / 2, z: (Math.min(...z) + Math.max(...z)) / 2 };
  const spines = posts.length - bays.length;
  return { ...bookKit(parts, origin), origin, posts, spines, live: posts.slice(0, spines), rooms: posts.map((p) => roomOfPost(p.slot.slug)) };
}

/**
 * The L4 reader track shelves: per bay, the lead post as a tall book with its cover held half open and the other posts
 * as spines on row boards in front of a back panel, in the track tone. The hovered spine (point-and-go
 * `L4:shelf:<slug>`), else the spine nearest the rover inside its bay zone, slides out toward the road and brightens (a
 * picked topic lights its bays through `TopicHighlights`, not its spines). Draw calls: bodies 1 (holo `plate`) and
 * covers 1 (holo `core`): the shared holo program. Lite drops additive blending; reduced motion snaps the pull. Not
 * raycast (interact/registry.ts picks). Writes `__hq.probes.shelves` (`bays`, `spines`, `pulled`).
 */
export function TrackShelves({ bays, tier, reducedMotion }: { bays: readonly LibraryBay[]; tier: GpuTier; reducedMotion: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const kit = useMemo(() => shelfMeshes(bays, tier), [bays, tier]);
  const pulls = useRef(new Float64Array(0));
  useDispose(kit);
  useUniformTime(kit.materials);

  // New meshes start with every spine in.
  useEffect(() => {
    pulls.current = new Float64Array(kit.posts.length);
    sceneProbes.shelves = { bays: bays.map((b) => b.track), spines: kit.spines, pulled: null };
    return () => void (sceneProbes.shelves = { bays: [], spines: 0, pulled: null });
  }, [bays, kit]);

  useFrame((_, dt) => {
    const mesh = ref.current;
    const pull = pulls.current;
    if (!mesh || pull.length !== kit.posts.length) return;
    const store = getHQStore().getState();
    const pick = store.floor === "L4" ? pickSpine(kit.live, store.hover?.item.id, roverRuntime.x, roverRuntime.z) : -1;
    const step = reducedMotion ? 1 : Math.min(dt, 0.1) * SHELF_SCENE.rate;
    let changed = false;
    for (let i = 0; i < pull.length; i++) {
      const p = pull[i] + MathUtils.clamp((i === pick ? 1 : 0) - pull[i], -step, step);
      if (p === pull[i]) continue;
      changed = true;
      const { slot, bay } = kit.posts[i];
      mesh.setMatrixAt(i, spineMatrix(slot, (pull[i] = p), bay.facing, M).premultiply(kit.shift));
      mesh.setColorAt(i, C.set(TONE).multiplyScalar(LEVEL.spine + LEVEL.pull * p));
    }
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
