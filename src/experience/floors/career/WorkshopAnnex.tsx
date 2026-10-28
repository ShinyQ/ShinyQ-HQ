"use client";

import { useMemo, useRef } from "react";
import { useHQStore } from "@/store/useHQStore";
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, InstancedBufferAttribute, Object3D } from "three";
import { COLORS, FLOOR_COLOR, FLOOR_GAP } from "../../config";
import { BatchedLabels, type BatchedLabelsHandle } from "../../fx/BatchedLabels";
import { FloatingSigns } from "../../fx/FloatingSign";
import { createHoloMaterial, HOLO_MODE } from "../../fx/holoFx";
import { CAREER_ICONS } from "../../fx/holoIcons";
import { HoloIcon } from "../../fx/HoloIcon";
import { neonColor } from "../../fx/materials";
import { useDispose } from "../../fx/useDispose";
import { GlassBox } from "../../tower/primitives";
import { MergedBoxes, MergedEdges } from "../roof/kit";
import type { Box } from "../roof/solids";
import type { CareerData, GpuTier, Rect } from "../../types";
import { useMemberFade } from "./CareerRooms";
import { workshopLabelSet, workshopSigns, WORKSHOP_SCENE } from "./labels";
import type { CareerRoadLayout } from "./layout";
import { SKYLINE } from "./skyline";
import { WORKSHOP } from "./workshopLayout";

export interface WorkshopLabels {
  workshop: string;
  repos: string;
  /** Time console sign (`hud.interact.console`). */
  console: string;
  /** "Back to elevator" on the console screen (`hud.pads.back`). */
  back: string;
  /** "21 stars" under a top repo's name. */
  stars: (count: number) => string;
}

const NO_RAYCAST = () => null;
const WINDOW_H = 9;
const SOLID = "#141428";

/** Every solid of the Workshop: benches, the console desk, the gateway posts and beam, the skyline plinth. */
function workshopBoxes(w: CareerRoadLayout["workshop"]): Box[] {
  const G = WORKSHOP.gateway;
  const B = WORKSHOP.bench;
  const C = WORKSHOP.console;
  const boxes: Box[] = [
    ...w.benches.map((b) => ({ x: b.center.x, y: 0, z: b.center.z, w: B.w, h: B.h, d: B.d })),
    { x: w.console.center.x, y: 0, z: w.console.center.z, w: C.w, h: C.h, d: C.d },
    ...w.gateway.posts.map((p) => ({ x: p.x, y: 0, z: p.z, w: G.post, h: G.height, d: G.post })),
    { x: w.gateway.x, y: G.height, z: 0, w: G.post, h: G.beam, d: Math.abs(w.gateway.posts[1].z - w.gateway.posts[0].z) + G.post },
  ];
  if (w.skyline.bars.length > 0) {
    const p = w.skyline.plinth;
    boxes.push({ x: (p.minX + p.maxX) / 2, y: 0, z: (p.minZ + p.maxZ) / 2, w: p.maxX - p.minX, h: SKYLINE.plinth, d: p.maxZ - p.minZ });
  }
  return boxes;
}

/** One holo plate per skyline bar, bench card and the console screen (instance scale = plate size, color = rim). */
function plateInstances(w: CareerRoadLayout["workshop"], tier: GpuTier) {
  const S = WORKSHOP_SCENE;
  const o = new Object3D();
  const matrices: number[] = [];
  const colors: number[] = [];
  const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string) => {
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.updateMatrix();
    matrices.push(...o.matrix.toArray());
    colors.push(...neonColor(color, 1.5, tier).toArray());
  };
  for (const bar of w.skyline.bars) add(bar.x, SKYLINE.plinth + bar.h / 2, bar.z, SKYLINE.bar, bar.h, SKYLINE.bar, bar.color);
  for (const b of w.benches) add(b.center.x, S.card.y, b.center.z, S.card.w, S.card.h, S.card.d, FLOOR_COLOR.L2);
  add(w.console.center.x, S.screen.y, w.console.center.z, WORKSHOP.console.screenW, WORKSHOP.console.screenH, S.screen.d, COLORS.cyan);
  const count = colors.length / 3;
  return { matrix: new Float32Array(matrices), color: new Float32Array(colors), alpha: new Float32Array(count).fill(1), count };
}

/**
 * The Workshop at the end of the Career Road (F3, owner approved 2026-10-14): the time console on the
 * forecourt, the gateway arch, one workbench per side project with a hologram card, the public repo
 * skyline (height by stars on a log scale, color by language), and the glass window over the Horizon
 * deck looking up at L3 (no text on it: owner decision 2026-10-15). About ten draw calls: merged solids, merged edges, one instanced holo plate mesh
 * (bars, cards, the console screen), one label batch, the bench icons (full tier), the signs and the
 * window. Static: nothing animates but the icons' sway (still under reduced motion). Clicks go through
 * point-and-go (`interact/registry.ts`, `L2:station:*`).
 */
export function WorkshopAnnex({
  layout,
  career,
  labs,
  labels,
  years,
  tier,
  reducedMotion,
}: {
  layout: CareerRoadLayout;
  career: CareerData;
  labs: Rect;
  labels: WorkshopLabels;
  years: readonly number[];
  tier: GpuTier;
  reducedMotion: boolean;
}) {
  const { workshop: w, windowX } = layout;
  const accent = FLOOR_COLOR.L2;
  const full = tier === "full";
  const d = layout.annex.d;

  const boxes = useMemo(() => workshopBoxes(w), [w]);

  const plates = useMemo(() => plateInstances(w, tier), [w, tier]);
  const plateGeometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    g.setAttribute("aAlpha", new InstancedBufferAttribute(plates.alpha, 1));
    return g;
  }, [plates]);
  useDispose(plateGeometry);
  const plateMaterial = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.plate, color: neonColor("#ffffff", 1.5, tier) }), [tier]);
  useDispose(plateMaterial);

  const text = useMemo(
    () => workshopLabelSet(w, { benches: career.sideProjects, years, back: labels.back, stars: labels.stars, legend: full }),
    [w, career.sideProjects, years, labels.back, labels.stars, full],
  );
  const batch = useRef<BatchedLabelsHandle>(null);
  useMemberFade(batch, text);
  const phone = useHQStore((s) => s.device.camera === "mobile");
  const signs = useMemo(
    () => workshopSigns(w, { workshop: labels.workshop, console: labels.console, repos: labels.repos }, accent, phone),
    [w, labels.workshop, labels.console, labels.repos, accent, phone],
  );
  const icons = useMemo(() => w.benches.map((b) => ({ x: b.center.x, y: WORKSHOP_SCENE.icon.y, z: b.center.z, face: 0 })), [w.benches]);

  // Sight lines from the window frame up to the east edge of the Labs slab (L3, one floor up).
  const sight = useMemo(() => {
    const pts: number[] = [];
    for (const z of [-d / 2, 0, d / 2]) pts.push(windowX, WINDOW_H, z, labs.maxX, FLOOR_GAP, z * (labs.maxZ / (d / 2)));
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return g;
  }, [d, windowX, labs.maxX, labs.maxZ]);
  useDispose(sight);

  return (
    <group name="workshop-annex">
      <MergedBoxes boxes={boxes} color={SOLID} emissive={accent} emissiveIntensity={0.12} />
      <MergedEdges boxes={boxes} color={accent} tier={tier} opacity={0.8} />
      {/* Frustum culled: the instance matrices exist from creation, so the bounds cover every plate. */}
      <instancedMesh key={plates.count} name="workshop-plates" args={[plateGeometry, plateMaterial, plates.count]} raycast={NO_RAYCAST}>
        <instancedBufferAttribute attach="instanceMatrix" args={[plates.matrix, 16]} />
        <instancedBufferAttribute attach="instanceColor" args={[plates.color, 3]} />
      </instancedMesh>
      <BatchedLabels ref={batch} labels={text.labels} name="workshop-labels" renderOrder={2} exactColors />
      {full && icons.length > 0 && <HoloIcon strokes={CAREER_ICONS.freelance} instances={icons} color={accent} size={WORKSHOP_SCENE.icon.size} tier={tier} reducedMotion={reducedMotion} />}
      <FloatingSigns signs={signs} name="career-workshop-signs" tier={tier} />

      <GlassBox size={[0.2, WINDOW_H, d]} position={[windowX - 0.1, WINDOW_H / 2, 0]} color={COLORS.violet} fillOpacity={0.1} edgeOpacity={0.9} />
      <lineSegments geometry={sight} raycast={NO_RAYCAST}>
        <lineBasicMaterial color={COLORS.violet} transparent opacity={0.45} toneMapped={false} />
      </lineSegments>
    </group>
  );
}
