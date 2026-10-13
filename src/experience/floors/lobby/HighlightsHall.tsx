"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { BufferAttribute, BufferGeometry, CanvasTexture, DataTexture, SRGBColorSpace, type Group, type Texture } from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { BatchedLabels, type BatchedLabelsHandle } from "../../fx/BatchedLabels";
import { neonColor } from "../../fx/materials";
import { RoadMarkings } from "../../fx/RoadMarkings";
import { useDispose } from "../../fx/useDispose";
import { registerExtraInteractables } from "../../interact/registry";
import { roverRuntime } from "../../rover/runtime";
import { precompileObject } from "../../scene/precompile";
import { FONTS } from "../../tower/primitives";
import type { ExperienceData, GpuTier } from "../../types";
import { PulseRings } from "../roof/kit";
import { coverCrop, hallAtlas, hallPhoto, hallShots, hallTexts, SHOT_CELL, shotQuadBuffers, type HallAtlas, type HallLabels } from "./hallContent";
import { GateCurtain, GateSign, PortalGlow, PortraitHolo, StatTiles } from "./HallFx";
import { ABOUT, aboutFace, contactBeacon, hallLights, statTiles } from "./hallGallery";
import { highlightsInteractables } from "./hallInteract";
import { HALL, HALL_LAYOUT, shouldLoadShots } from "./hallLayout";
import { HallLights } from "./HallLights";
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

/** The three project screenshots on their monoliths as one mesh over the canvas atlas (dark until it loads). */
function ShotWall({ thumbs, atlas, texture }: { thumbs: readonly string[]; atlas: HallAtlas; texture: Texture | null }) {
  const geometry = useMemo(() => {
    const { positions, uvs, indices } = shotQuadBuffers(hallShots(thumbs.length), atlas.cells);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("uv", new BufferAttribute(uvs, 2));
    g.setIndex(new BufferAttribute(indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [atlas, thumbs.length]);
  useDispose(geometry);
  if (!thumbs.length) return null;
  // Black screens until the atlas loads; a map from the start keeps the program the same (precompiled with the hall).
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshBasicMaterial map={texture ?? DARK} color={texture ? "#ffffff" : "#0b1020"} toneMapped={false} />
    </mesh>
  );
}

/** One placeholder map shared by every mount (never disposed: 1 x 1 pixel). */
const DARK = (() => {
  const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

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
 * compiles on arrival: the hall mounts hidden behind the certification wall after the intro.
 */
function usePrecompiled(group: RefObject<Group | null>): boolean {
  const { gl, camera, scene } = useThree();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    let live = true;
    void precompileObject(gl, g, camera, scene)
      .catch(() => null)
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [group, gl, camera, scene]);
  return ready;
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
  const lights = useMemo(() => hallLights(tier, projectCount), [tier, projectCount]);
  const pulses = useMemo(() => contactBeacon().pulses.map((p) => ({ ...p, color: HALL.tone.contact })), []);
  const thumbs = useMemo(() => data.highlights.projects.map((p) => p.thumb), [data.highlights.projects]);
  const atlas = useMemo(() => hallAtlas(thumbs, SHOT_CELL[tier === "full" ? "full" : "lite"]), [thumbs, tier]);
  const [load, setLoad] = useState(false);
  useFrame(() => {
    if (!load && shouldLoadShots(getHQStore().getState().floor, roverRuntime.x)) setLoad(true);
  });
  const texture = useHallAtlas(atlas, load);
  const photo = useMemo(() => {
    const cell = atlas.cells[atlas.cells.length - 1];
    const q = hallPhoto(thumbs.length);
    return { center: q.center, cell: [cell.x / atlas.width, 0, (cell.x + cell.w) / atlas.width, 1] as [number, number, number, number] };
  }, [atlas, thumbs.length]);
  const labelBatch = useRef<BatchedLabelsHandle>(null);
  const group = useRef<Group>(null);
  const ready = usePrecompiled(group);
  return (
    <group ref={group} name="highlights-hall" visible={ready}>
      {/* A faint plaza fill (like the Career Road), so the large hall floor does not glow under bloom. */}
      <RoadMarkings network={HALL_LAYOUT.network} color={HALL.tone.about} tier={tier} reducedMotion={reducedMotion} chevronSpacing={5} fillOpacity={tier === "full" ? 0.05 : 0.08} />
      <HallSolids shapes={shapes} />
      <HallLines shapes={shapes} tier={tier} />
      <HallLights lights={lights} tier={tier} />
      <StatTiles tiles={tiles} tier={tier} reducedMotion={reducedMotion} labels={labelBatch} tile={texts.tile} />
      <PortraitHolo center={photo.center} yaw={aboutFace().yaw} radius={ABOUT.disc.r} map={texture} cell={photo.cell} tier={tier} />
      <ShotWall thumbs={thumbs} atlas={atlas} texture={texture} />
      <PortalGlow tier={tier} />
      <PulseRings sources={pulses} radius={0.5} grow={5} speed={0.45} tier={tier} reducedMotion={reducedMotion} />
      <GateCurtain tier={tier} reducedMotion={reducedMotion} />
      {/* Text loads fonts asynchronously; keep it from holding back the geometry. */}
      <Suspense fallback={null}>
        <BatchedLabels ref={labelBatch} labels={texts.labels} name="highlights-labels" />
        <GateSign text={labels.hall} tier={tier} />
      </Suspense>
    </group>
  );
}
