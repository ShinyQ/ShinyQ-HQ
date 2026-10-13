"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useState } from "react";
import { BufferAttribute, BufferGeometry, CanvasTexture, SRGBColorSpace } from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { BatchedLabels } from "../../fx/BatchedLabels";
import { RoadMarkings } from "../../fx/RoadMarkings";
import { registerExtraInteractables } from "../../interact/registry";
import { roverRuntime } from "../../rover/runtime";
import { FONTS } from "../../tower/primitives";
import type { ExperienceData, GpuTier } from "../../types";
import { MergedBoxes, MergedEdges } from "../roof/kit";
import { coverCrop, hallAtlas, hallLabels, hallPhoto, hallShots, hallSolids, SHOT_CELL, shotQuadBuffers, type HallAtlas, type HallLabels } from "./hallContent";
import { highlightsInteractables } from "./hallInteract";
import { HALL, HALL_LAYOUT, shouldLoadShots } from "./hallLayout";

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

/** The three project screenshots and the owner's portrait as one mesh over a canvas atlas, loaded once the rover heads for the hall. */
function ShotWall({ thumbs, tier }: { thumbs: readonly string[]; tier: GpuTier }) {
  const [load, setLoad] = useState(false);
  useFrame(() => {
    if (!load && shouldLoadShots(getHQStore().getState().floor, roverRuntime.x)) setLoad(true);
  });
  const atlas = useMemo(() => hallAtlas(thumbs, SHOT_CELL[tier === "full" ? "full" : "lite"]), [thumbs, tier]);
  const texture = useHallAtlas(atlas, load);
  const geometry = useMemo(() => {
    const { positions, uvs, indices } = shotQuadBuffers([...hallShots(thumbs.length), hallPhoto(thumbs.length)], atlas.cells);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("uv", new BufferAttribute(uvs, 2));
    g.setIndex(new BufferAttribute(indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [atlas, thumbs.length]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!texture) return null;
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

/**
 * L1 Highlights Hall: road markings (passage, plaza, spurs), every solid in one mesh plus one edge
 * mesh, every text in one BatchedText and the screenshots and the owner's portrait in one lazy atlas mesh. Clicks go through the
 * point-and-go registry (`hallInteract.ts`, registered below), not through meshes here. Static: nothing animates, so reduced motion needs no case.
 */
export function HighlightsHall({ data, labels, tier }: { data: ExperienceData; labels: HallLabels; tier: GpuTier }) {
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  // Point-and-go: the stations are registry targets while the hall is mounted (the hall has no click handlers of its own).
  useEffect(() => registerExtraInteractables("L1", highlightsInteractables(HALL_LAYOUT, labels.stations)), [labels.stations]);
  const solids = useMemo(() => hallSolids(data.highlights.projects.length), [data.highlights.projects.length]);
  const texts = useMemo(() => hallLabels(data, labels, FONTS), [data, labels]);
  const thumbs = useMemo(() => data.highlights.projects.map((p) => p.thumb), [data.highlights.projects]);
  return (
    <group name="highlights-hall">
      {/* A faint plaza fill (like the Career Road), so the large hall floor does not glow under bloom. */}
      <RoadMarkings network={HALL_LAYOUT.network} color={HALL.tone.about} tier={tier} reducedMotion={reducedMotion} chevronSpacing={5} fillOpacity={tier === "full" ? 0.05 : 0.08} />
      <MergedBoxes boxes={solids} color="#0b1020" emissive={HALL.tone.about} emissiveIntensity={0.05} />
      <MergedEdges boxes={solids} color={HALL.tone.about} tier={tier} opacity={0.7} />
      {/* Text loads fonts asynchronously; keep it from holding back the geometry. */}
      <Suspense fallback={null}>
        <BatchedLabels labels={texts} name="highlights-labels" />
      </Suspense>
      <ShotWall thumbs={thumbs} tier={tier} />
    </group>
  );
}
