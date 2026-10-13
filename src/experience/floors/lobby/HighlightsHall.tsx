"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Box3, BufferAttribute, BufferGeometry, CanvasTexture, Frustum, Matrix4, SRGBColorSpace, Vector3, type Group, type Object3D } from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { BatchedLabels, type BatchedLabelsHandle } from "../../fx/BatchedLabels";
import { neonColor } from "../../fx/materials";
import { RoadMarkings } from "../../fx/RoadMarkings";
import { useDispose } from "../../fx/useDispose";
import { registerExtraInteractables } from "../../interact/registry";
import { roverRuntime } from "../../rover/runtime";
import { sceneTarget } from "../../scene/postHandle";
import { precompileObject } from "../../scene/precompile";
import { renderProbe } from "../../scene/renderProbe";
import { FONTS } from "../../tower/primitives";
import type { ExperienceData, GpuTier } from "../../types";
import { coverCrop, hallAtlas, hallPhoto, hallShots, hallTexts, SHOT_CELL, type HallAtlas, type HallLabels } from "./hallContent";
import { GateCurtain, GateSign, StageLights, StagePanels, StagePortal, StageRings } from "./HallFx";
import { aboutFace, contactBeacon, hallLights, statTiles } from "./hallGallery";
import { highlightsInteractables } from "./hallInteract";
import { HALL, HALL_LAYOUT, shouldLoadShots } from "./hallLayout";
import { lightInstances, panelInstances, ringInstances } from "./hallStage";
import { hallLineBuffer, hallShapes, portraitRing, solidBuffers, type HallShapes } from "./hallSolids";
import { HIGHLIGHT_STAT_COUNT } from "./stations";

/** Draws the atlas cells into one canvas row (cover fit, per-cell brightness); a failed image leaves its cell dark. */
function useHallAtlas(atlas: HallAtlas, enabled: boolean) {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  const key = `${atlas.width}x${atlas.height}|${atlas.cells.map((c) => c.src).join("|")}`;
  useEffect(() => {
    if (!enabled || atlas.cells.length === 0) return;
    let cancelled = false;
    let built: CanvasTexture | null = null;
    const canvas = document.createElement("canvas");
    canvas.width = atlas.width;
    canvas.height = atlas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    Promise.all(
      atlas.cells.map(
        (cell) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.onload = () => {
              const { sx, sy, sw, sh } = coverCrop(img.naturalWidth, img.naturalHeight, cell.w, cell.h);
              ctx.filter = cell.brightness === 1 ? "none" : `brightness(${cell.brightness})`;
              ctx.drawImage(img, sx, sy, sw, sh, cell.x, 0, cell.w, cell.h);
              ctx.filter = "none";
              resolve();
            };
            img.onerror = () => resolve();
            img.src = cell.src;
          }),
      ),
    ).then(() => {
      if (cancelled) return;
      built = new CanvasTexture(canvas);
      built.colorSpace = SRGBColorSpace;
      built.anisotropy = 4;
      setTexture(built);
    });
    return () => {
      cancelled = true;
      built?.dispose();
    };
    // `key` captures the atlas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return texture;
}

/** Every gallery solid in one mesh (boxes and round prisms), lit like the rest of the Lobby. */
function HallSolids({ shapes }: { shapes: HallShapes }) {
  const geometry = useMemo(() => {
    const { positions, normals, indices } = solidBuffers(shapes.boxes, shapes.prisms);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("normal", new BufferAttribute(normals, 3));
    g.setIndex(new BufferAttribute(indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [shapes]);
  useDispose(geometry);
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshStandardMaterial color="#0b1020" emissive={HALL.tone.about} emissiveIntensity={0.05} roughness={0.7} metalness={0.2} />
    </mesh>
  );
}

/** Every neon line of the gallery in one line mesh, boosted on the full tier so it blooms. */
function HallLines({ shapes, tier }: { shapes: HallShapes; tier: GpuTier }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(hallLineBuffer(shapes, [portraitRing(aboutFace())]), 3));
    g.computeBoundingSphere();
    return g;
  }, [shapes]);
  useDispose(geometry);
  const neon = useMemo(() => neonColor(HALL.tone.about, 1.4, tier), [tier]);
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={neon} transparent opacity={0.7} toneMapped={false} />
    </lineSegments>
  );
}

/**
 * Compiles (and pins) every program of the hall before it shows (P2's precompile API), so nothing
 * compiles on arrival. Like BoostFx it waits until the scene has drawn into its final target (the full
 * tier's composer input), and shows every child for the synchronous compile call: three skips hidden
 * objects, and the curtain and an out-of-view hall are hidden.
 */
function HallReady({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null);
  const tier = useHQStore((s) => s.tier);
  const [ready, setReady] = useState(false);
  const started = useRef(false);
  useFrame((state) => {
    const g = group.current;
    if (started.current || !g || !renderProbe.rendered || (tier === "full" && sceneTarget() === null)) return;
    started.current = true;
    const hidden: Object3D[] = [];
    g.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const done = precompileObject(state.gl, g, state.camera, state.scene);
    for (const o of hidden) o.visible = false;
    void done.catch(() => null).finally(() => setReady(true));
  });
  return (
    <group ref={group} name="highlights-hall" visible={ready}>
      {children}
    </group>
  );
}

/**
 * Floor-local bounds of everything inside `HallView` (from the gateway arch east: shapes, lights up to the
 * spotlight apexes). The lead road west of the arch and the gate sign draw outside it.
 */
const HALL_GRID = 6;
const HALL_BOUNDS = new Box3(new Vector3(HALL.gate.x - HALL.gate.depth / 2 - 1, -0.5, HALL.zone.minZ - 1), new Vector3(HALL.zone.maxX + 1, 13, HALL.zone.maxZ + 1));

/**
 * Hides the whole hall while its bounds are outside the view: the instanced lights, tiles and rings
 * cannot be frustum culled per mesh (their geometry bounds do not cover the instances), so without this
 * they would cost draw calls from the Lobby spawn, where the hall is behind the camera.
 */
function HallView({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null);
  const tmp = useMemo(() => ({ box: new Box3(), cell: new Box3(), frustum: new Frustum(), m: new Matrix4() }), []);
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g?.parent) return;
    const { box, cell, frustum, m } = tmp;
    g.parent.updateWorldMatrix(true, false);
    box.copy(HALL_BOUNDS).applyMatrix4(g.parent.matrixWorld);
    frustum.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    // The plane test is conservative: a large box next to a frustum corner passes it. Testing a grid of
    // smaller cells keeps the hall hidden from the Lobby spawn, where it is behind the camera.
    const N = HALL_GRID;
    const dx = (box.max.x - box.min.x) / N;
    const dz = (box.max.z - box.min.z) / N;
    let seen = false;
    for (let i = 0; i < N && !seen; i++)
      for (let k = 0; k < N && !seen; k++) {
        cell.min.set(box.min.x + i * dx, box.min.y, box.min.z + k * dz);
        cell.max.set(cell.min.x + dx, box.max.y, cell.min.z + dz);
        seen = frustum.intersectsBox(cell);
      }
    g.visible = seen;
  });
  return (
    <group ref={group} name="highlights-hall-view">
      {children}
    </group>
  );
}

/**
 * L1 Highlights Hall gallery (spectacle round, Part 2): the gateway arch with its floating sign and
 * one-shot light curtain, the four station shapes (pedestal, monoliths, lit arch, beacon), the light
 * fountain and fake stage lighting. Draw calls: road markings, one solid mesh, one line mesh, one text
 * batch, the screenshots, the portrait, the tiles, the lights, the portal, the beacon rings, the sign
 * (text, backing, outline) and the curtain only while it sweeps. Clicks go through the point-and-go
 * registry (`hallInteract.ts`). Reduced motion: everything still, no sweep.
 */
export function HighlightsHall({ data, labels, tier }: { data: ExperienceData; labels: HallLabels; tier: GpuTier }) {
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  // Point-and-go: the stations are registry targets while the hall is mounted (the hall has no click handlers of its own).
  useEffect(() => registerExtraInteractables("L1", highlightsInteractables(HALL_LAYOUT, labels.stations)), [labels.stations]);
  const projectCount = data.highlights.projects.length;
  const shapes = useMemo(() => hallShapes(projectCount), [projectCount]);
  const texts = useMemo(() => hallTexts(data, labels, FONTS), [data, labels]);
  const tiles = useMemo(() => statTiles(Math.min(HIGHLIGHT_STAT_COUNT, data.stats.length)), [data.stats.length]);
  const lights = useMemo(() => lightInstances(hallLights(tier, projectCount), tier), [tier, projectCount]);
  const rings = useMemo(() => ringInstances(contactBeacon().pulses, HALL.tone.contact, tier), [tier]);
  const thumbs = useMemo(() => data.highlights.projects.map((p) => p.thumb), [data.highlights.projects]);
  const atlas = useMemo(() => hallAtlas(thumbs, SHOT_CELL[tier === "full" ? "full" : "lite"]), [thumbs, tier]);
  const [load, setLoad] = useState(false);
  useFrame(() => {
    if (!load && shouldLoadShots(getHQStore().getState().floor, roverRuntime.x)) setLoad(true);
  });
  const texture = useHallAtlas(atlas, load);
  const panels = useMemo(() => panelInstances(tiles, hallShots(thumbs.length), hallPhoto(thumbs.length), atlas.cells, tier), [tiles, thumbs.length, atlas, tier]);
  const phases = useMemo(() => tiles.map((t) => t.phase), [tiles]);
  const labelBatch = useRef<BatchedLabelsHandle>(null);
  return (
    <HallReady>
      {/* A faint plaza fill (like the Career Road), so the large hall floor does not glow under bloom. Outside HallView: the lead road starts by the spawn. */}
      <RoadMarkings network={HALL_LAYOUT.network} color={HALL.tone.about} tier={tier} reducedMotion={reducedMotion} chevronSpacing={5} fillOpacity={tier === "full" ? 0.05 : 0.08} />
      <HallView>
        <HallSolids shapes={shapes} />
        <HallLines shapes={shapes} tier={tier} />
        <StageLights instances={lights} tier={tier} reducedMotion={reducedMotion} />
        <StagePanels instances={panels} phases={phases} map={texture} tier={tier} reducedMotion={reducedMotion} labels={labelBatch} tile={texts.tile} />
        <StagePortal tier={tier} reducedMotion={reducedMotion} />
        <StageRings instances={rings} tier={tier} reducedMotion={reducedMotion} />
        <GateCurtain tier={tier} reducedMotion={reducedMotion} />
        {/* Text loads fonts asynchronously; keep it from holding back the geometry. */}
        <Suspense fallback={null}>
          <BatchedLabels ref={labelBatch} labels={texts.labels} name="highlights-labels" />
        </Suspense>
      </HallView>
      {/* The sign turns to the camera, so it can reach past HALL_BOUNDS; its own meshes are frustum culled. */}
      <Suspense fallback={null}>
        <GateSign text={labels.hall} tier={tier} />
      </Suspense>
    </HallReady>
  );
}
