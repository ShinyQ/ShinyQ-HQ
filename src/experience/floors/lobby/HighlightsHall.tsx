"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Box3, BufferAttribute, BufferGeometry, CanvasTexture, Frustum, Matrix4, SRGBColorSpace, Vector3, type Group, type Object3D } from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { BatchedLabels, type BatchedLabelsHandle } from "../../fx/BatchedLabels";
import { FloatingSigns } from "../../fx/FloatingSign";
import { neonColor } from "../../fx/materials";
import { RoadMarkings } from "../../fx/RoadMarkings";
import { useDispose } from "../../fx/useDispose";
import { afterFirstFrameIdle } from "../../boot-signals";
import { speculativePrefetchOn } from "../floorChunks";
import { registerExtraInteractables } from "../../interact/registry";
import { roverRuntime } from "../../rover/runtime";
import { sceneTarget } from "../../scene/postHandle";
import { precompileObject } from "../../scene/precompile";
import { renderProbe } from "../../scene/renderProbe";
import { FONTS } from "../../tower/primitives";
import type { ExperienceData, GpuTier } from "../../types";
import { coverCrop, hallAtlas, hallPhoto, hallShots, hallTexts, partTexts, RESULT_ROWS, SHOT_CELL, TIER_TONE, type HallAtlas, type HallLabels } from "./hallContent";
import { GateCurtain, StageLights, StageMotes, StagePanels, StagePortal, StageRings, StageShell } from "./HallFx";
import { aboutFace, contactBeacon, gateOpening, gateSign, hallLights, MONOLITH, statTiles, winsFace, winsTiles } from "./hallGallery";
import { highlightsInteractables } from "./hallInteract";
import { HALL, HALL_LAYOUT, shouldLoadShots } from "./hallLayout";
import { hallPremiumState, inHall, loadHallPremium, shouldLoadHallPremium, useHallPremium } from "./hallPremium/chunk";
import { LOBBY_SLAB } from "./slab";
import { hallShellInstances, lightInstances, panelInstances, portalInstances, ringInstances, SHELL, STAGE_KIND, type StageInstance } from "./hallStage";
import { hallLineBuffer, hallShapes, partShapes, portraitRing, solidBuffers, type Circle, type HallShapes } from "./hallSolids";
import { HIGHLIGHT_STAT_COUNT, isHighlightRoom } from "./stations";

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

/** B4 base (owner decision 2026-11-04): deep indigo surfaces with a faint indigo glow. */
const B4_BASE = "#0a0620";
const B4_GLOW = "#1c1442";

/** Every gallery solid in one mesh (boxes and round prisms), lit like the rest of the Lobby. */
function HallSolids({ shapes }: { shapes: HallShapes }) {
  const geometry = useMemo(() => {
    const { positions, normals, indices } = solidBuffers(shapes.boxes, shapes.prisms, shapes.quads);
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
      <meshStandardMaterial color={B4_BASE} emissive={B4_GLOW} emissiveIntensity={0.25} roughness={0.55} metalness={0.3} />
    </mesh>
  );
}

/** Every neon line of a hall half in one line mesh (the beacon's lattice with the south half), boosted on the full tier so it blooms. */
function HallLines({ shapes, tier, extra, lattice }: { shapes: HallShapes; tier: GpuTier; extra: readonly Circle[]; lattice: boolean }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(hallLineBuffer(shapes, extra, lattice), 3));
    g.computeBoundingSphere();
    return g;
  }, [shapes, extra, lattice]);
  useDispose(geometry);
  const neon = useMemo(() => neonColor(SHELL.violet, 1.2, tier), [tier]);
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={neon} transparent opacity={0.55} toneMapped={false} />
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
 * The hall draws in three parts (2026-11-02): the north part, north of the Lobby's south edge line (S, z 27: the gateway
 * arch, about me, top projects, work experience, wins, the north fountain); contact, in the south-west corner; and the
 * south part (now, results, the south fountain). Each part is its own `HallView` with its own meshes, so a Lobby view
 * that reaches only one corner of the hall (the spawn looking south sees the contact beacon at the frame's edge) draws
 * only that part.
 */
const HALL_SPLIT = LOBBY_SLAB.halfZ;
type HallPart = "north" | "contact" | "south";
const CONTACT_EAST = HALL.stations.contact.maxX + 1;
function partOf(x: number, z: number): HallPart {
  if (z < HALL_SPLIT) return "north";
  return x < CONTACT_EAST && z > HALL.stations.contact.minZ - 8 ? "contact" : "south";
}
const byPart = <T,>(list: readonly T[], at: (t: T) => readonly [number, number]): Record<HallPart, T[]> => {
  const out = { north: [] as T[], contact: [] as T[], south: [] as T[] };
  for (const t of list) out[partOf(...at(t))].push(t);
  return out;
};

/** A floor-local box around a station's footprint and the lights in front of it (`pad` u around it), up to `top`. */
const around = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, pad: number, top: number) =>
  new Box3(new Vector3(r.minX - pad, -0.5, r.minZ - pad), new Vector3(r.maxX + pad, top, r.maxZ + pad));

/**
 * Floor-local view boxes of each part. The north part keeps the whole area from the gateway arch east (shapes, lights up
 * to the spotlight apexes), tested on a 6 x 6 grid of cells. The south part tests a box per landmark (now, results) and
 * the band its ceiling ribs span, so the empty plaza floor, which a Lobby view facing south reaches at the frame's edge,
 * never draws it; contact tests a box around its station. The gate tunnel (rings, runway, packets) is its own part around
 * the lead road. The lead road's markings and the gate sign draw outside them.
 */
const GATE_O = gateOpening();
const GATE_BOX = new Box3(
  new Vector3(HALL.gate.x - HALL.gate.depth / 2 - 0.6 - (SHELL.ring.count - 1) * SHELL.ring.gap - SHELL.runway.west - 1, -0.5, (GATE_O.minZ + GATE_O.maxZ) / 2 - SHELL.ring.r - 0.5),
  new Vector3(HALL.plaza.x + 1, SHELL.ring.y + SHELL.ring.r + 0.5, (GATE_O.minZ + GATE_O.maxZ) / 2 + SHELL.ring.r + 0.5),
);
const HALL_VIEW: Record<HallPart, Box3[]> = {
  north: [new Box3(new Vector3(HALL.gate.x - HALL.gate.depth / 2 - 1, -0.5, HALL.zone.minZ - 1), new Vector3(HALL.zone.maxX + 1, 13, HALL_SPLIT + 1))],
  contact: [around(HALL.stations.contact, 5, 13)],
  south: [
    around(HALL.stations.now, 5, 11),
    around(HALL.stations.results, 5, 13),
    new Box3(new Vector3(HALL.zone.minX, SHELL.rib.spring - 1, HALL_SPLIT), new Vector3(HALL.zone.maxX, SHELL.rib.spring + SHELL.rib.rise + 0.5, HALL.zone.maxZ)),
  ],
};
const HALL_GRID: Record<HallPart, number> = { north: 6, contact: 2, south: 2 };
/** The gate tunnel's instances (its own view part); every other shell instance stands in a hall part. */
const GATE_KINDS: readonly number[] = [STAGE_KIND.gateRing, STAGE_KIND.runway, STAGE_KIND.packet];
/** The portrait and the wins rings both stand in the north part; the others have none. */
const RINGS: Record<HallPart, readonly Circle[]> = { north: [portraitRing(aboutFace()), portraitRing(winsFace())], contact: [], south: [] };

/**
 * Hides a hall half while its bounds are outside the view: the instanced lights, tiles and rings
 * cannot be frustum culled per mesh (their geometry bounds do not cover the instances), so without this
 * they would cost draw calls from the Lobby spawn, where the hall is behind the camera.
 */
function HallView({ boxes, grid, name, children }: { boxes: readonly Box3[]; grid: number; name: string; children: ReactNode }) {
  const group = useRef<Group>(null);
  const tmp = useMemo(() => ({ box: new Box3(), cell: new Box3(), frustum: new Frustum(), m: new Matrix4() }), []);
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g?.parent) return;
    const { box, cell, frustum, m } = tmp;
    g.parent.updateWorldMatrix(true, false);
    frustum.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    // The plane test is conservative: a large box next to a frustum corner passes it. Testing a grid of
    // smaller cells keeps the hall hidden from the Lobby spawn, where it is behind the camera.
    let seen = false;
    for (let b = 0; b < boxes.length && !seen; b++) {
      box.copy(boxes[b]).applyMatrix4(g.parent.matrixWorld);
      const dx = (box.max.x - box.min.x) / grid;
      const dz = (box.max.z - box.min.z) / grid;
      for (let i = 0; i < grid && !seen; i++)
        for (let k = 0; k < grid && !seen; k++) {
          cell.min.set(box.min.x + i * dx, box.min.y, box.min.z + k * dz);
          cell.max.set(cell.min.x + dx, box.max.y, cell.min.z + dz);
          seen = frustum.intersectsBox(cell);
        }
    }
    g.visible = seen;
  });
  return (
    <group ref={group} name={name}>
      {children}
    </group>
  );
}

/**
 * L1 Highlights Hall gallery (spectacle round, Part 2; extended to the slab's full depth 2026-11-02): the gateway arch with
 * its floating sign and one-shot light curtain, the seven station shapes (pedestals, monoliths, lit arches, beacon), the
 * light fountains and fake stage lighting, in two halves (`HALL_SPLIT`). Draw calls: road markings; per half one solid
 * mesh, one line mesh, one text batch, the lights and the portals; the north half's screenshots, portrait and tiles, the
 * south half's beacon rings; the sign (text, backing, outline) and the curtain only while it sweeps. Clicks go through
 * the point-and-go registry (`hallInteract.ts`). Reduced motion: everything still, no sweep.
 */
export function HighlightsHall({ data, labels, tier }: { data: ExperienceData; labels: HallLabels; tier: GpuTier }) {
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  // Point-and-go: the stations are registry targets while the hall is mounted (the hall has no click handlers of its own).
  useEffect(() => registerExtraInteractables("L1", highlightsInteractables(HALL_LAYOUT, labels.stations)), [labels.stations]);
  const projectCount = data.highlights.projects.length;
  const resultCount = Math.min(MONOLITH.u.length, Math.ceil(data.highlights.results.length / RESULT_ROWS));
  const shapes = useMemo(() => {
    const all = hallShapes(projectCount, resultCount);
    return { north: partShapes(all, partOf, "north"), contact: partShapes(all, partOf, "contact"), south: partShapes(all, partOf, "south") };
  }, [projectCount, resultCount]);
  // The interiors chunk (owner decision 2026-11-04), once loaded: its texts join each part's batch.
  const premium = useHallPremium();
  const texts = useMemo(() => {
    const base = hallTexts(data, labels, FONTS);
    const extra = premium ? premium.premiumTexts(data, labels, FONTS) : [];
    // The interiors replace whole groups of the station texts with their own (the pillar columns by the curtain's roles).
    const keep = base.group.map((g) => !premium?.REPLACES.includes(g));
    const all = {
      labels: [...base.labels.filter((_, i) => keep[i]), ...extra],
      tile: [...base.tile.filter((_, i) => keep[i]), ...extra.map(() => -1)],
      group: [...base.group.filter((_, i) => keep[i]), ...extra.map(() => "interiors")],
    };
    return { north: partTexts(all, partOf, "north"), contact: partTexts(all, partOf, "contact"), south: partTexts(all, partOf, "south") };
  }, [data, labels, premium]);
  const winTiers = data.highlights.wins.tiers;
  // About me's stat tiles, then one wins tile per tier in its tier's tone (`hallTexts` rides their labels in this order).
  const tiles = useMemo(
    () => [...statTiles(Math.min(HIGHLIGHT_STAT_COUNT, data.stats.length)), ...winsTiles(winTiers.length).map((t, i) => ({ ...t, tone: TIER_TONE[winTiers[i].tier] }))],
    [data.stats.length, winTiers],
  );
  const lights = useMemo(() => byPart(lightInstances(hallLights(projectCount, resultCount), tier), (l) => [l.at[0], l.at[2]]), [tier, projectCount, resultCount]);
  const portals = useMemo(() => byPart(portalInstances(tier), (p) => [p.at[0], p.at[2]]), [tier]);
  const rings = useMemo(() => ringInstances(contactBeacon().pulses, HALL.tone.contact, tier), [tier]);
  const shell = useMemo(() => {
    const all = hallShellInstances(tier);
    const at = (i: StageInstance) => [i.at[0], i.at[2]] as const;
    const motes = all.filter((i) => i.stage[0] === STAGE_KIND.mote);
    return {
      gate: all.filter((i) => GATE_KINDS.includes(i.stage[0])),
      parts: byPart(all.filter((i) => i.stage[0] !== STAGE_KIND.mote && !GATE_KINDS.includes(i.stage[0])), at),
      motes: byPart(motes, at),
    };
  }, [tier]);
  const thumbs = useMemo(() => data.highlights.projects.map((p) => p.thumb), [data.highlights.projects]);
  const atlas = useMemo(() => hallAtlas(thumbs, SHOT_CELL[tier === "full" ? "full" : "lite"]), [thumbs, tier]);
  const [load, setLoad] = useState(false);
  useFrame(() => {
    if (!load && shouldLoadShots(getHQStore().getState().floor, roverRuntime.x)) setLoad(true);
  });
  const texture = useHallAtlas(atlas, load);
  // The interiors chunk (owner decision 2026-11-04): at idle on L1 (speculative prefetch on), on a hall intent (a drive
  // into the hall, a station room open) or once the rover heads for the hall. Checked twice a second, never retried
  // after a failed speculative load (`__hq.hall.loadPremium()` retries).
  const idle = useRef(false);
  const nextCheck = useRef(0);
  useEffect(() => afterFirstFrameIdle(() => (idle.current = speculativePrefetchOn(window.location.search))), []);
  useFrame(({ clock }) => {
    if (clock.elapsedTime < nextCheck.current || hallPremiumState() !== "idle") return;
    nextCheck.current = clock.elapsedTime + 0.5;
    const s = getHQStore().getState();
    const target = roverRuntime.autopilot?.point;
    const intent = (target ? inHall(target) : false) || (s.activeRoom ? isHighlightRoom(s.activeRoom) : false);
    if (shouldLoadHallPremium({ floor: s.floor, x: roverRuntime.x, idle: idle.current, intent })) void loadHallPremium().catch(() => null);
  });
  const labelBatch = useRef<BatchedLabelsHandle>(null);
  const inside = { tier, reducedMotion, data, labels };
  // About me's stat values (the first label of each stat tile) count up on its wake.
  const countUp = useMemo(() => {
    const n = Math.min(HIGHLIGHT_STAT_COUNT, data.stats.length);
    const members = Array.from({ length: n }, (_, k) => texts.north.tile.indexOf(k));
    return { handle: labelBatch, members, values: members.map((_, k) => data.stats[k].value) };
  }, [texts, data.stats]);
  const panels = useMemo(() => panelInstances(tiles, hallShots(thumbs.length), hallPhoto(thumbs.length), atlas.cells, tier), [tiles, thumbs.length, atlas, tier]);
  const phases = useMemo(() => tiles.map((t) => t.phase), [tiles]);
  const gateSigns = useMemo(() => [gateSign(labels.hall)], [labels.hall]);
  return (
    <HallReady>
      {/* The lead road from the Lobby to the gateway arch, cyan (B4). Outside HallView: it starts by the spawn. */}
      <RoadMarkings network={HALL_LAYOUT.drawn} color={SHELL.cyan} tier={tier} reducedMotion={reducedMotion} chevronSpacing={5} fillOpacity={tier === "full" ? 0.08 : 0.1} />
      <HallView boxes={HALL_VIEW.north} grid={HALL_GRID.north} name="highlights-hall-view">
        {premium && <premium.HallPremium part="north" {...inside} countUp={countUp} />}
        <HallSolids shapes={shapes.north} />
        <StageShell instances={shell.parts.north} reducedMotion={reducedMotion} />
        <StageMotes instances={shell.motes.north} reducedMotion={reducedMotion} />
        <HallLines shapes={shapes.north} tier={tier} extra={RINGS.north} lattice={false} />
        <StageLights instances={lights.north} tier={tier} reducedMotion={reducedMotion} />
        {/* Every stat tile (About me and wins) stands in the north half, so the tile texts ride the north batch. */}
        <StagePanels instances={panels} phases={phases} map={texture} tier={tier} reducedMotion={reducedMotion} labels={labelBatch} tile={texts.north.tile} />
        {/* The interiors' light curtain replaces the work experience glow once loaded. */}
        {!premium && <StagePortal tier={tier} reducedMotion={reducedMotion} instances={portals.north} />}
        <GateCurtain tier={tier} reducedMotion={reducedMotion} />
        {/* Text loads fonts asynchronously; keep it from holding back the geometry. */}
        <Suspense fallback={null}>
          <BatchedLabels ref={labelBatch} labels={texts.north.labels} name="highlights-labels" />
        </Suspense>
      </HallView>
      <HallView boxes={HALL_VIEW.contact} grid={HALL_GRID.contact} name="highlights-hall-view-contact">
        {premium && <premium.HallPremium part="contact" {...inside} />}
        <HallSolids shapes={shapes.contact} />
        <StageShell instances={shell.parts.contact} reducedMotion={reducedMotion} />
        <StageMotes instances={shell.motes.contact} reducedMotion={reducedMotion} />
        <HallLines shapes={shapes.contact} tier={tier} extra={RINGS.contact} lattice />
        <StageLights instances={lights.contact} tier={tier} reducedMotion={reducedMotion} />
        <StageRings instances={rings} tier={tier} reducedMotion={reducedMotion} />
        <Suspense fallback={null}>
          <BatchedLabels labels={texts.contact.labels} name="highlights-labels-contact" />
        </Suspense>
      </HallView>
      <HallView boxes={HALL_VIEW.south} grid={HALL_GRID.south} name="highlights-hall-view-south">
        {premium && <premium.HallPremium part="south" {...inside} />}
        <HallSolids shapes={shapes.south} />
        <StageShell instances={shell.parts.south} reducedMotion={reducedMotion} />
        <StageMotes instances={shell.motes.south} reducedMotion={reducedMotion} />
        <HallLines shapes={shapes.south} tier={tier} extra={RINGS.south} lattice={false} />
        <StageLights instances={lights.south} tier={tier} reducedMotion={reducedMotion} />
        <StagePortal tier={tier} reducedMotion={reducedMotion} instances={portals.south} />
        <Suspense fallback={null}>
          <BatchedLabels labels={texts.south.labels} name="highlights-labels-south" />
        </Suspense>
      </HallView>
      {/* The gate tunnel: three rings in front of the arch, the runway and its packets (one draw), hidden off view. */}
      <HallView boxes={[GATE_BOX]} grid={3} name="highlights-hall-view-gate">
        <StageShell instances={shell.gate} reducedMotion={reducedMotion} name="hall-gate-shell" />
      </HallView>
      {/* The floating gateway sign (shared FloatingSigns: holo plate plus batched text) turns to the camera, so it stays outside HallView. */}
      <Suspense fallback={null}>
        <FloatingSigns signs={gateSigns} name="hall-gate-sign" tier={tier} />
      </Suspense>
    </HallReady>
  );
}
