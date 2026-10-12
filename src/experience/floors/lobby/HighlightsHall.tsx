"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useState } from "react";
import { BufferAttribute, BufferGeometry, CanvasTexture, SRGBColorSpace } from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { BatchedLabels } from "../../fx/BatchedLabels";
import { RoadMarkings } from "../../fx/RoadMarkings";
import { roverRuntime } from "../../rover/runtime";
import { FONTS } from "../../tower/primitives";
import type { ExperienceData, GpuTier } from "../../types";
import { MergedBoxes, MergedEdges } from "../roof/kit";
import { coverCrop, hallLabels, hallShots, hallSolids, SHOT_CELL, shotQuadBuffers, type HallLabels } from "./hallContent";
import { HALL, HALL_LAYOUT, shouldLoadShots } from "./hallLayout";

/** Draws the cover thumbnails into one canvas row (cover fit); a failed image leaves its cell dark. */
function useShotAtlas(srcs: readonly string[], cell: { w: number; h: number }, enabled: boolean) {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  const key = srcs.join("|");
  useEffect(() => {
    if (!enabled || srcs.length === 0) return;
    let cancelled = false;
    let built: CanvasTexture | null = null;
    const canvas = document.createElement("canvas");
    canvas.width = cell.w * srcs.length;
    canvas.height = cell.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    Promise.all(
      srcs.map(
        (src, i) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.onload = () => {
              const { sx, sy, sw, sh } = coverCrop(img.naturalWidth, img.naturalHeight, cell.w, cell.h);
              ctx.drawImage(img, sx, sy, sw, sh, i * cell.w, 0, cell.w, cell.h);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = src;
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
    // `key` captures srcs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cell.w, cell.h, enabled]);
  return texture;
}

/** The three project screenshots as one mesh over a canvas atlas, loaded once the rover heads for the hall. */
function ShotWall({ thumbs, tier }: { thumbs: readonly string[]; tier: GpuTier }) {
  const [load, setLoad] = useState(false);
  useFrame(() => {
    if (!load && shouldLoadShots(getHQStore().getState().floor, roverRuntime.x)) setLoad(true);
  });
  const texture = useShotAtlas(thumbs, SHOT_CELL[tier === "full" ? "full" : "lite"], load);
  const geometry = useMemo(() => {
    const { positions, uvs, indices } = shotQuadBuffers(hallShots(thumbs.length), thumbs.length);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("uv", new BufferAttribute(uvs, 2));
    g.setIndex(new BufferAttribute(indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [thumbs.length]);
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
 * mesh, every text in one BatchedText and the screenshots in one lazy atlas mesh. Clicks go through the
 * point-and-go registry (Task 11), not through meshes here. Static: nothing animates, so reduced motion needs no case.
 */
export function HighlightsHall({ data, labels, tier }: { data: ExperienceData; labels: HallLabels; tier: GpuTier }) {
  const reducedMotion = useHQStore((s) => s.reducedMotion);
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
