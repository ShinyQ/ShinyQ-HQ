"use client";

import { useFrame, type RootState } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  Frustum,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Sphere,
  Texture,
  Vector2,
  Vector3,
  type Group,
  type InstancedMesh,
  type Mesh,
  type Object3D,
  type WebGLRenderer,
} from "three";
import { STATE_TONE } from "@/lib/office/model";
import type { OfficeState } from "@/lib/office/protocol";
import { hudLayout } from "@/hud/layout";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { createHoloMaterial, HOLO_MODE } from "../../../fx/holoFx";
import { neonColor } from "../../../fx/materials";
import { sceneProbes } from "../../../fx/probes";
import { useDispose } from "../../../fx/useDispose";
import { registerExtraInteractables } from "../../../interact/registry";
import { MAX_FRAME_DT } from "../../../rover/controller";
import { animationSpeed } from "../../../scene/animationSpeed";
import { forgetDrawn, shownInScene, whenDrawn } from "../../../scene/drawnWork";
import { sceneTarget } from "../../../scene/postHandle";
import { precompileObject } from "../../../scene/precompile";
import { renderProbe } from "../../../scene/renderProbe";
import { roverRuntime } from "../../../rover/runtime";
import { RIDE_CULL_BOUNDS } from "../../../tower/rideCull";
import type { GpuTier, Rect } from "../../../types";
import { LOBBY } from "../../../config";
import { OFFICE, officeTowerColumn, type OfficeSlot, type OfficeTranslate } from "../officeLayout";
import { canvasTexture, OFFICE_SLOTS, officeBounds, officeChipMode, useCanvasFonts } from "../officeShell";
import { CHIP_ROW, chipMaxWidth, chipRowBounds, chipsDotsOnly, chipsOneLine, layoutChipRows, nextChipFar, OFFICE_CHIP_ANCHORS, OFFICE_CHIP_TOP, officeHudBoxes, segmentHitsBox } from "./chipRows";
import type { ScreenBox } from "../../../fx/labelPlacement";
import { officeInteractables } from "./interact";
import { officeLive, useOfficeFeed } from "./live";
import { ATLAS, ATLAS_CELLS, atlasCell, cellUv, dirtyCells, drawFace, drawFlag, drawScreen, FACE_FPS_MAX, FLAG_CELL, faceCell, faceKey, screenCell, screenKey, uploadOrigin, type CanvasFonts, type Cell, type ScreenTexts } from "./officeAtlas";
import { crewFx, DRONES, newActor, type CrewFx } from "./crew";
import { lodStep, OFFICE_LOD, officeCrew, restCrewKey, restCrewPose, stepOfficeCrew, type LodStep } from "./crewFrame";
import { towerKey, towerLanes, writeCrewGlow, writeTower } from "./crewFx";
import { AtlasClock, fadeLevel, fadeTag, LEAD, leadEnd, RoverWrites, stepFade, WallGate, type Fade } from "./officeFrame";
import { officeView, screenInput, type OfficeRoverView, type OfficeView } from "./officeModel";
import { officeSignal, setOfficeSignal, signalFromBody } from "./officeSignal";
import { officeInstances, PARTS_PER_ROVER, roverFrame, writeDeskScreen, writeFace, writeFlag, writeGlow, writeDrones, writeRover } from "./officeRig";
import { OFFICE_STATE_STYLE, slotPhase, STILL_T } from "./officeVisual";
import { drawWall, WALL_CANVAS, wallModel, type WallModel } from "./officeWall";
import { OFFICE_CHIP_COUNT, officeRuntime, setChipFar, setChipsCompact } from "./runtime";
import { loadOfficeWatch } from "./watchLoader";

const NO_RAYCAST = () => null;
/** The Rovers this scene draws: both rows (slots 0 to 9; the desks and the riser are in the main-path shell). */
const SLOTS = OFFICE_SLOTS;
/** Instance and quad counts, one Rover per seat (`SLOTS` holds every seat). */
const COUNTS = officeInstances();
/** Desk screens redraw at most this often (faces at most FACE_FPS_MAX on both tiers), only the cells whose frame key changed. */
const SCREEN_FPS = { full: 10, lite: 5 } as const;
const FRAME = new Matrix4();
const ORIGIN = new Vector2();

/** Ten faces, ten desk screens and ten flag plates as one merged quad mesh (one draw call, one atlas). */
function atlasQuads(slots: readonly OfficeSlot[]): BufferGeometry {
  const n = slots.length;
  const quads = COUNTS.quads;
  const positions = new Float32Array(quads * 12);
  const uvs = new Float32Array(quads * 8);
  const index: number[] = [];
  for (let q = 0; q < quads; q++) {
    const [u0, v0, u1, v1] = cellUv(q < n ? faceCell(q) : q < 2 * n ? screenCell(q - n) : FLAG_CELL);
    uvs.set([u0, v0, u1, v0, u1, v1, u0, v1], q * 8);
    const b = q * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const rest = restCrewPose();
  for (const s of slots) {
    writeFace(roverFrame(s, rest, FRAME), positions, s.slot);
    writeDeskScreen(s, positions, n + s.slot);
    writeFlag(FRAME, rest, positions, 2 * n + s.slot);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
  g.setAttribute("uv", new BufferAttribute(uvs, 2));
  // Unused by the basic material, but three keys programs on HAS_NORMAL: with it the quads share the wall's program.
  g.setAttribute("normal", new BufferAttribute(new Float32Array(quads * 12), 3));
  g.setIndex(index);
  // The faces move with their Rovers: one fixed sphere around the whole office, so culling never trusts stale bounds.
  g.boundingSphere = officeSphere();
  return g;
}

/** One fixed sphere around the whole office (3 u past its corners): the bounds of everything that moves with the Rovers. */
function officeSphere(): Sphere {
  const b = officeBounds();
  return new Sphere(new Vector3((b.minX + b.maxX) / 2, 2, (b.minZ + b.maxZ) / 2), Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 3);
}

const DARK_TOWER = { total: 0, done: 0, running: false } as const;

/**
 * Rest instances (every Rover asleep and docked, the tower dark), attached at creation so precompile, bounds and
 * culling see the final meshes: the glow mesh's bounds take in the tower's dots from here.
 */
function restInstances(slots: readonly OfficeSlot[]) {
  const n = COUNTS;
  const parts = new Float32Array(n.parts * 16);
  const treads = new Float32Array(n.treads * 16);
  const glow = new Float32Array(n.glow * 16);
  const colors = new Float32Array(n.glow * 3);
  const p = restCrewPose();
  const fx = crewFx(newActor("asleep"), true);
  for (const s of slots) {
    roverFrame(s, p, FRAME);
    writeRover(FRAME, p, parts, s.slot, treads);
    writeGlow(s, FRAME, "asleep", null, p.tipScale, 0, true, LOBBY.officeWing.stop, glow, colors, fx.flicker);
    writeCrewGlow(s, FRAME, "asleep", fx, 0, slotPhase(s.slot), true, glow, colors);
  }
  writeTower(DARK_TOWER, 0, true, glow, colors);
  return { parts, treads, glow, colors };
}

/**
 * Compiles and pins every office program once the scene draws into its final target (HallReady in
 * HighlightsHall.tsx), showing hidden children for the synchronous compile, so the office never hitches on its
 * first view. Shared programs make it a no-op in practice; it stays for safety.
 */
function OfficeReady({ children }: { children: ReactNode }) {
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
    void done.catch(() => null).finally(() => {
      setReady(true);
      sceneProbes.office.loaded = true;
    });
  });
  return (
    <group ref={group} name="agent-office-live" visible={ready}>
      {children}
    </group>
  );
}

interface RoverMeshes {
  parts: InstancedMesh;
  treads: InstancedMesh;
  glow: InstancedMesh;
  quads: Mesh;
}

/**
 * Writes the marked Rovers (instance matrices, face and flag quads, rig and crew glow) from the poses `writes` recorded
 * and the crew's fx, then clears their marks. The helper drones' bodies move with the glow key, so a glow-only write
 * rewrites them too while a Rover has (or just lost) drones; `drawn` holds each slot's drawn drone count.
 */
function flushRovers(writes: RoverWrites, fxs: readonly CrewFx[], slots: readonly OfficeSlot[], rovers: readonly OfficeRoverView[], now: number, reduced: boolean, lite: boolean, m: RoverMeshes, drawn: number[]): void {
  const position = m.quads.geometry.getAttribute("position") as BufferAttribute;
  const matrices = m.glow.instanceMatrix.array as Float32Array;
  const colors = m.glow.instanceColor!.array as Float32Array;
  const parts = m.parts.instanceMatrix.array as Float32Array;
  let posed = false;
  let droned = false;
  let glowed = false;
  for (const r of rovers) {
    const slot = r.slot;
    const poseDue = writes.posePending[slot];
    const glowDue = writes.glowPending[slot];
    if (!poseDue && !glowDue) continue;
    const p = writes.poses[slot];
    const phase = slotPhase(slot);
    const drones = Math.min(r.helpers, DRONES.max);
    roverFrame(slots[slot], p, FRAME);
    if (poseDue) {
      writeRover(FRAME, p, parts, slot, m.treads.instanceMatrix.array as Float32Array, drones, now, phase, reduced);
      writeFace(FRAME, position.array as Float32Array, slot);
      writeFlag(FRAME, p, position.array as Float32Array, 2 * slots.length + slot);
      posed = true;
    } else if (glowDue && (drones > 0 || drawn[slot] > 0)) {
      writeDrones(FRAME, drones, now, phase, reduced, parts, slot * PARTS_PER_ROVER);
      droned = true;
    }
    drawn[slot] = drones;
    if (glowDue) {
      const fx = fxs[slot];
      writeGlow(slots[slot], FRAME, r.state, r.progress, p.tipScale, now, reduced, writes.cam, matrices, colors, fx.flicker);
      writeCrewGlow(slots[slot], FRAME, r.state, fx, now, phase, reduced, matrices, colors, drones, lite, writes.cam);
      glowed = true;
    }
    writes.done(slot);
  }
  if (posed || droned) m.parts.instanceMatrix.needsUpdate = true;
  if (posed) {
    m.treads.instanceMatrix.needsUpdate = true;
    position.needsUpdate = true;
  }
  if (glowed) {
    m.glow.instanceMatrix.needsUpdate = true;
    m.glow.instanceColor!.needsUpdate = true;
  }
}

/** Paints one atlas cell (a face for indices below the Rover count, else a desk screen), the old look first while it crossfades. */
function paintCell(ctx: CanvasRenderingContext2D, cell: Cell, face: boolean, r: OfficeRoverView, fade: Fade | null, k: number, drawT: number, reduced: boolean, fonts: CanvasFonts, texts: ScreenTexts, t: OfficeTranslate): void {
  const phase = slotPhase(r.slot);
  const style = OFFICE_STATE_STYLE[r.state];
  const from = fade && k < 1 ? OFFICE_STATE_STYLE[fade.from] : null;
  if (face) {
    if (from) drawFace(ctx, cell, from.face, from.color, drawT, phase, fonts.mono, 1, reduced);
    drawFace(ctx, cell, style.face, style.color, drawT, phase, fonts.mono, k, reduced);
    return;
  }
  const input = screenInput(r, t);
  if (from) drawScreen(ctx, cell, { ...input, kind: from.screen, color: from.color }, texts, drawT, phase, fonts, 1);
  drawScreen(ctx, cell, input, texts, drawT, phase, fonts, k);
}

interface AtlasState {
  primed: boolean;
  clock: AtlasClock;
  keys: string[];
  next: string[];
  states: OfficeState[];
  fades: (Fade | null)[];
  sources: { face: Texture; screen: Texture };
}

interface AtlasFrame {
  rovers: readonly OfficeRoverView[];
  now: number;
  reduced: boolean;
  /** Desk screens' and faces' most repaints a second (the far level of detail lowers both). */
  fps: number;
  faceFps: number;
  fonts: CanvasFonts;
  texts: ScreenTexts;
  t: OfficeTranslate;
}

/**
 * Tracks the crossfades, then, when a half of the atlas is due and the office is drawn, repaints only the cells
 * whose key changed: the first time straight into the atlas canvas (one whole upload), after that into a
 * cell-sized canvas copied into place on the GPU (`copyTextureToTexture`), never a whole re-upload.
 */
function paintAtlas(gl: WebGLRenderer, g: Group, Q: Mesh, l: AtlasState, a: AtlasFrame): void {
  const { rovers, now, reduced, fps, faceFps, fonts, texts, t } = a;
  for (const r of rovers) {
    l.fades[r.slot] = stepFade(l.states[r.slot], r.state, l.fades[r.slot], reduced, now);
    l.states[r.slot] = r.state;
  }
  l.clock.tick(now, fps, faceFps);
  // Until the atlas is primed both halves count as due, so the first upload never ships blank cells.
  const faceDue = l.clock.faceDue || !l.primed;
  const screenDue = l.clock.screenDue || !l.primed;
  if ((!faceDue && !screenDue) || !shownInScene(g)) return;
  const map = (Q.material as MeshBasicMaterial).map;
  const canvas = map?.image as HTMLCanvasElement | undefined;
  const atlasCtx = canvas?.getContext("2d");
  if (!map || !atlasCtx) return;
  const drawT = reduced ? STILL_T : now;
  const n = rovers.length;
  for (const r of rovers) {
    const fade = l.fades[r.slot];
    const tag = fadeTag(fade, fadeLevel(fade, now));
    l.next[r.slot] = faceDue ? faceKey(OFFICE_STATE_STYLE[r.state].face, drawT, slotPhase(r.slot), FACE_FPS_MAX, reduced) + tag : l.keys[r.slot];
    l.next[n + r.slot] = screenDue ? screenKey(screenInput(r, t), drawT, fps, reduced) + tag : l.keys[n + r.slot];
  }
  const dirty = dirtyCells(l.keys, l.next);
  if (!dirty.length) return;
  for (const i of dirty) {
    const face = i < n;
    const r = rovers[face ? i : i - n];
    const fade = l.fades[r.slot];
    const cell = atlasCell(i);
    if (!l.primed) {
      // The first frame paints straight into the atlas canvas, uploaded whole once below.
      paintCell(atlasCtx, cell, face, r, fade, fadeLevel(fade, now), drawT, reduced, fonts, texts, t);
    } else {
      const src = face ? l.sources.face : l.sources.screen;
      const srcCanvas = src.image as HTMLCanvasElement;
      const ctx = srcCanvas.getContext("2d");
      if (!ctx) return;
      paintCell(ctx, { x: 0, y: 0, w: cell.w, h: cell.h }, face, r, fade, fadeLevel(fade, now), drawT, reduced, fonts, texts, t);
      // Keep the atlas canvas whole (a context restore re-uploads it), then patch just this cell on the GPU.
      atlasCtx.drawImage(srcCanvas, cell.x, cell.y);
      const origin = uploadOrigin(cell);
      gl.copyTextureToTexture(src, map, null, ORIGIN.set(origin.x, origin.y));
    }
    l.keys[i] = l.next[i];
  }
  if (!l.primed) {
    // The flag cell sits outside the keyed cells: painted once, before the one whole upload, and never again.
    drawFlag(atlasCtx, FLAG_CELL, STATE_TONE.input);
    l.primed = true;
    map.needsUpdate = true;
  }
}

/**
 * The ten office Rovers (both console rows): light parts and treads (two instanced standard meshes with `alphaHash`,
 * the player Rover's wheel program), their faces and the desk screens (one quad mesh on one canvas atlas, the player
 * face's material settings), and the glow (one instanced holo mesh: antenna tips, halos, progress dots, the crew's
 * effects and the CI tower's lane dots). Each desk's crew actor acts out its state (`crew.ts`). Nothing is written
 * while no pose, glow key, tower key or camera changed; the atlas uploads only its changed cells. Past
 * `OFFICE_LOD.farDistance` the crew, its effects and the tower step `OFFICE_LOD.farHz` times a second (`lodStep`) and the
 * faces and desk screens repaint at most `OFFICE_LOD.atlasFps` times a second.
 */
function OfficeRovers({ view, slots, tier, t }: { view: OfficeView; slots: readonly OfficeSlot[]; tier: GpuTier; t: OfficeTranslate }) {
  const reduced = useHQStore((s) => s.reducedMotion);
  const box = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useDispose(box);
  const light = useMemo(() => new MeshStandardMaterial({ color: "#d4d4d8", roughness: 0.55, alphaHash: true }), []);
  useDispose(light);
  const dark = useMemo(() => new MeshStandardMaterial({ color: "#27272a", roughness: 0.9, alphaHash: true }), []);
  useDispose(dark);
  const dot = useMemo(() => new PlaneGeometry(1, 1), []);
  useDispose(dot);
  const glow = useMemo(() => {
    const m = createHoloMaterial({ mode: HOLO_MODE.dot, color: neonColor("#ffffff", 1.6, tier), params: [0, 1, 0, 0] });
    // Dot mode never moves a vertex, so the ride cull may trust the instance bounds (like the observatory dots).
    m.userData[RIDE_CULL_BOUNDS] = true;
    return m;
  }, [tier]);
  useDispose(glow);
  // Version 0 until the first frame paints every cell and uploads it once; after that only changed cells upload.
  const atlas = useMemo(() => canvasTexture(ATLAS.w, ATLAS.h), []);
  useDispose(atlas);
  // Cell-sized sources for the partial uploads (never drawn as textures themselves).
  const faceSrc = useMemo(() => canvasTexture(atlasCell(0).w, atlasCell(0).h), []);
  useDispose(faceSrc);
  const screenSrc = useMemo(() => canvasTexture(atlasCell(ATLAS_CELLS / 2).w, atlasCell(ATLAS_CELLS / 2).h), []);
  useDispose(screenSrc);
  const screens = useMemo(() => new MeshBasicMaterial({ map: atlas, color: neonColor("#ffffff", 1.6, tier), toneMapped: false, alphaHash: true }), [atlas, tier]);
  useDispose(screens);
  const quads = useMemo(() => atlasQuads(slots), [slots]);
  useDispose(quads);
  const rest = useMemo(() => restInstances(slots), [slots]);
  const writes = useMemo(() => new RoverWrites(slots.length, restCrewPose(), restCrewKey(), LOBBY.officeWing.stop), [slots]);
  const crew = useMemo(() => officeCrew(slots, LOBBY.officeWing.stop, officeTowerColumn(LOBBY.officeWing)), [slots]);
  const lanes = useMemo(() => towerLanes(view), [view]);
  // The tower key last written (the rest instances drew it dark): "" writes the tower on the first frame in view.
  const lanesKey = useRef("");
  const texts = useMemo((): ScreenTexts => ({ waiting: t("3d.waiting"), jobs: (done, total) => t("3d.jobs", { done, total }), sleep: "z Z" }), [t]);
  const group = useRef<Group>(null);
  const parts = useRef<InstancedMesh>(null);
  const treads = useRef<InstancedMesh>(null);
  const glows = useRef<InstancedMesh>(null);
  // Per-frame writes go through the mesh refs (the geometry, the material's map), never through the memoized values.
  const screenMesh = useRef<Mesh>(null);
  const local = useRef<AtlasState>({
    primed: false,
    clock: new AtlasClock(),
    keys: Array.from({ length: ATLAS_CELLS }, () => ""),
    next: Array.from({ length: ATLAS_CELLS }, () => ""),
    states: view.rovers.map((r) => r.state),
    fades: view.rovers.map((): Fade | null => null),
    sources: { face: faceSrc, screen: screenSrc },
  });
  const redraw = useCallback(() => {
    local.current.keys.fill("");
  }, []);
  const fonts = useCanvasFonts(redraw);
  const fps = SCREEN_FPS[tier === "full" ? "full" : "lite"];
  const lite = tier !== "full";
  // Each slot's drawn helper drones (the rest instances draw none).
  const drawn = useMemo(() => slots.map(() => 0), [slots]);
  // The level of detail's carried time and its per-frame answer (one object, written in place).
  const lod = useRef<LodStep>({ step: false, dt: 0, acc: 0 });

  useEffect(() => {
    const g = group.current;
    return () => {
      if (g) forgetDrawn(g);
    };
  }, [slots]);
  // Fixed bounds (like the quads'): instance bounds from the rest instances would miss orbiting drones and confetti past
  // the end Rovers, so they could pop at the screen edges; the glow keeps the tower's dots too.
  useLayoutEffect(() => {
    const sphere = officeSphere();
    if (parts.current) parts.current.boundingSphere = sphere.clone();
    if (treads.current) treads.current.boundingSphere = sphere.clone();
    const G = glows.current;
    if (G) {
      G.computeBoundingSphere();
      G.boundingSphere!.union(sphere);
    }
  }, [slots]);
  useEffect(() => {
    officeRuntime.crew = crew.actors;
    return () => {
      officeRuntime.crew = [];
    };
  }, [crew]);

  useFrame(({ clock, camera, gl }, rawDt) => {
    const g = group.current;
    const P = parts.current;
    const D = treads.current;
    const G = glows.current;
    const Q = screenMesh.current;
    if (!g || !P || !D || !G || !Q || !officeRuntime.inView) return;
    const now = clock.elapsedTime;
    const far = officeRuntime.far;
    paintAtlas(gl, g, Q, local.current, { rovers: view.rovers, now, reduced, fps: far ? Math.min(fps, OFFICE_LOD.atlasFps) : fps, faceFps: far ? OFFICE_LOD.atlasFps : Infinity, fonts: fonts.current, texts, t });
    const step = lodStep(officeRuntime.distance, Math.min(rawDt, MAX_FRAME_DT) * animationSpeed(), lod.current.acc, lod.current);
    if (!step.step) return;
    sceneProbes.office.steps += 1;
    sceneProbes.office.bob = stepOfficeCrew(crew, writes, slots, view.rovers, step.dt, now, reduced, camera.position, lite);
    const tk = towerKey(lanes, now, reduced);
    if (writes.pending() || tk !== lanesKey.current) {
      const rovers = view.rovers;
      // Only how the meshes look: wait for a drawn frame (a hidden L1 or the office before its precompile skips it).
      // One callback per object (the latest wins), so it covers both the Rovers and the tower.
      whenDrawn(g, () => {
        flushRovers(writes, crew.fx, slots, rovers, now, reduced, lite, { parts: P, treads: D, glow: G, quads: Q }, drawn);
        if (tk === lanesKey.current) return;
        writeTower(lanes, now, reduced, G.instanceMatrix.array as Float32Array, G.instanceColor!.array as Float32Array);
        lanesKey.current = tk;
        G.instanceMatrix.needsUpdate = true;
        G.instanceColor!.needsUpdate = true;
      });
    }
  });

  return (
    <group ref={group} name="office-rovers">
      <instancedMesh ref={parts} args={[box, light, COUNTS.parts]} raycast={NO_RAYCAST} name="office-rover-parts">
        <instancedBufferAttribute attach="instanceMatrix" args={[rest.parts, 16]} usage={DynamicDrawUsage} />
      </instancedMesh>
      <instancedMesh ref={treads} args={[box, dark, COUNTS.treads]} raycast={NO_RAYCAST} name="office-rover-treads">
        <instancedBufferAttribute attach="instanceMatrix" args={[rest.treads, 16]} usage={DynamicDrawUsage} />
      </instancedMesh>
      <mesh ref={screenMesh} geometry={quads} material={screens} raycast={NO_RAYCAST} name="office-screens" />
      <instancedMesh ref={glows} args={[dot, glow, COUNTS.glow]} raycast={NO_RAYCAST} name="office-glow" renderOrder={1}>
        <instancedBufferAttribute attach="instanceMatrix" args={[rest.glow, 16]} usage={DynamicDrawUsage} />
        <instancedBufferAttribute attach="instanceColor" args={[rest.colors, 3]} usage={DynamicDrawUsage} />
      </instancedMesh>
    </group>
  );
}

/**
 * The screen wall: one quad with its own canvas texture, checked twice a second; the model rebuilds only when the
 * feed (or the locale) changed or a second passed, and the texture redraws only when its content or spinner changed.
 */
function OfficeWall({ view, tier, t }: { view: OfficeView; tier: GpuTier; t: OfficeTranslate }) {
  const size = WALL_CANVAS[tier === "full" ? "full" : "lite"];
  const reduced = useHQStore((s) => s.reducedMotion);
  const locale = useHQStore((s) => s.locale);
  const texture = useMemo(() => canvasTexture(size.w, size.h, CanvasTexture), [size]);
  useDispose(texture);
  const plane = useMemo(() => new PlaneGeometry(OFFICE.wall.w, OFFICE.wall.h), []);
  useDispose(plane);
  const material = useMemo(() => new MeshBasicMaterial({ map: texture, color: neonColor("#ffffff", 1.3, tier), toneMapped: false, alphaHash: true }), [texture, tier]);
  useDispose(material);
  const wall = useRef<Mesh>(null);
  const local = useRef({ next: 0, gate: new WallGate(), model: null as WallModel | null });
  const redraw = useCallback(() => {
    local.current.gate.reset();
  }, []);
  const fonts = useCanvasFonts(redraw);
  useEffect(() => {
    const w = wall.current;
    return () => {
      if (w) forgetDrawn(w);
    };
  }, []);
  useFrame(({ clock }) => {
    const l = local.current;
    const now = clock.elapsedTime;
    const w = wall.current;
    if (now < l.next || !officeRuntime.inView || !w) return;
    l.next = now + 0.5;
    if (l.gate.stale([view, t, locale], now) || !l.model) {
      l.model = wallModel(view, t, locale, Date.now());
      l.gate.built(l.model);
    }
    const model = l.model;
    // A fixed time under reduced motion: the spinner holds still and never forces a redraw.
    const drawT = reduced ? 0 : now;
    whenDrawn(w, () => {
      if (!l.gate.changed(model, drawT)) return;
      const map = (w.material as MeshBasicMaterial).map;
      const ctx = (map?.image as HTMLCanvasElement | undefined)?.getContext("2d");
      if (!map || !ctx) return;
      drawWall(ctx, size, model, drawT, fonts.current);
      map.needsUpdate = true;
      sceneProbes.office.wallFrames += 1;
    });
  });
  // The plane faces north (rotation y = pi), so the canvas reads left to right from the plaza.
  return (
    <mesh
      ref={wall}
      geometry={plane}
      material={material}
      raycast={NO_RAYCAST}
      name="office-wall"
      position={[LOBBY.officeWing.wall.x, OFFICE.wall.bottom + OFFICE.wall.h / 2, LOBBY.officeWing.wall.z - OFFICE.wall.t / 2 - 0.01]}
      rotation={[0, Math.PI, 0]}
    />
  );
}

/** `OfficeWatch`'s per-frame state, one entry per slot (made once, so a frame allocates nothing). */
function createWatchState() {
  const perSlot = <T,>(make: () => T) => officeRuntime.chips.map(make);
  return {
    box: new Box3(),
    frustum: new Frustum(),
    m: new Matrix4(),
    v: new Vector3(),
    els: perSlot((): HTMLElement | null => null),
    shown: perSlot(() => false),
    half: perSlot(() => 0),
    h: perSlot(() => 0),
    // The Rover's head projected this frame (px).
    hx: perSlot(() => 0),
    hy: perSlot(() => 0),
    // What the cached size was read for: the far flag, the compact layout and the view.
    wFar: perSlot((): boolean | null => null),
    wSmall: perSlot(() => false),
    wView: perSlot((): OfficeView | null => null),
    // The max width last written to the chip (px; NaN until written for this element).
    wMax: perSlot(() => NaN),
    // The row this frame: the shown chips' targets, half widths and slots, their laid out centres and rows (0 the top),
    // and their boxes (x0, y0, x1, y1 px; the leader lines keep off the other chips).
    tx: perSlot(() => 0),
    th: perSlot(() => 0),
    ts: perSlot(() => 0),
    out: perSlot(() => 0),
    row: perSlot(() => 0),
    bx: perSlot((): ScreenBox => ({ x0: 0, y0: 0, x1: 0, y1: 0 })),
    // The last written chip x and y and leader line (x, y, length, angle), its fade and its tick (x, y; NaN hidden).
    cx: perSlot(() => NaN),
    cy: perSlot(() => NaN),
    lead: perSlot(() => [NaN, NaN, NaN, NaN]),
    leadOn: perSlot(() => false),
    leadFaded: perSlot(() => false),
    tick: perSlot(() => [NaN, NaN]),
    // The wall's top edge projected this frame (x0, y0, x1, y1, px; NaN off the camera) and a leader line's end.
    wall: [NaN, NaN, NaN, NaN],
    end: { x: 0, y: 0, tick: false, faded: false },
    // When the office-in-view test runs next (s).
    next: 0,
    // The HUD boxes, the row's bounds and the chips' widest fit for one screen size, HUD layout and count of named chips.
    width: 0,
    height: 0,
    layout: "",
    named: -1,
    hud: [] as ScreenBox[],
    bounds: { left: 0, right: 0 },
    max: CHIP_ROW.max as number,
  };
}
type WatchState = ReturnType<typeof createWatchState>;

/**
 * The HUD boxes, the row's bounds and the chips' max width, again only when the screen size, the HUD layout or the count
 * of chips with a name (`named`: the desks with an agent; an off-duty desk's chip is a dot) changes.
 */
function fitRow(w: WatchState, width: number, height: number, hud: "desktop" | "tablet" | "phone", top: number, named: number) {
  if (w.width === width && w.height === height && w.layout === hud && w.named === named) return;
  w.width = width;
  w.height = height;
  w.layout = hud;
  w.named = named;
  w.hud = officeHudBoxes(width, height, hud);
  chipRowBounds(width, top, w.hud, w.bounds);
  w.max = chipMaxWidth(w.bounds, named, OFFICE_CHIP_COUNT - named);
}

/** How many of the view's chips carry a name (an agent at the desk). */
function namedChips(view: OfficeView): number {
  let n = 0;
  for (let i = 0; i < OFFICE_CHIP_COUNT && i < view.rovers.length; i++) if (view.rovers[i].agent !== null) n++;
  return n;
}

/** Hides chip `slot` once (it turns far), then leaves it alone until it comes back into view; its leader line too. */
function hideChip(w: WatchState, slot: number, el: HTMLElement | null) {
  if (w.shown[slot] && el) {
    el.style.visibility = "hidden";
    el.style.opacity = "0";
    w.shown[slot] = false;
    setChipFar(slot, true);
  }
  writeLead(w, slot, NaN, NaN);
}

/** The screen wall's top edge (the frame's top, its front face): every leader line stops at its level (`leadEnd`). */
const WALL_TOP = { y: OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame, z: LOBBY.officeWing.wall.z - OFFICE.wall.t / 2, x: OFFICE.wall.w / 2 + OFFICE.wall.frame } as const;

/** Projects the wall's top edge ends into `w.wall` (px; NaN when either is behind the camera). */
function projectWallTop(w: WatchState, camera: RootState["camera"], width: number, height: number) {
  for (let k = 0; k < 2; k++) {
    w.v.set(LOBBY.officeWing.wall.x + (k ? WALL_TOP.x : -WALL_TOP.x), WALL_TOP.y, WALL_TOP.z).project(camera);
    const back = w.v.z >= 1;
    w.wall[2 * k] = back ? NaN : ((w.v.x + 1) / 2) * width;
    w.wall[2 * k + 1] = back ? NaN : ((1 - w.v.y) / 2) * height;
  }
}

/** Shows chip `slot`'s tick at (x, y) (its centre, px), or hides it (NaN). */
function writeTick(w: WatchState, slot: number, x: number, y: number) {
  const tick = officeRuntime.ticks[slot];
  const last = w.tick[slot];
  if (!tick || (last[0] === x && last[1] === y) || (Number.isNaN(x) && Number.isNaN(last[0]))) return;
  last[0] = x;
  last[1] = y;
  if (Number.isNaN(x)) tick.style.visibility = "hidden";
  else {
    tick.style.transform = `translate3d(${x - LEAD.tick / 2}px, ${y - 1}px, 0)`;
    tick.style.visibility = "visible";
  }
}

/** The end of chip `slot`'s leader line from (x, y) (`leadEnd`, into `w.end`; a tick beside the wall clear of the HUD boxes, `above` its Rover's head). */
function endLead(w: WatchState, slot: number, x: number, y: number, above = true) {
  const a = w.wall;
  return leadEnd(x, y, w.hx[slot], w.hy[slot], a[0], a[1], a[2], a[3], CHIP_ROW.lead, w.end, w.hud, w.width, above);
}

/** Whether the line from (x, y) to `e` crosses no HUD box and none of the row's other `n` chips (`self` its own index). */
function clearLead(w: WatchState, x: number, y: number, e: { x: number; y: number }, n: number, self: number): boolean {
  for (let i = 0; i < w.hud.length; i++) if (segmentHitsBox(x, y, e.x, e.y, w.hud[i])) return false;
  for (let k = 0; k < n; k++) if (k !== self && !Number.isNaN(w.bx[k].x0) && segmentHitsBox(x, y, e.x, e.y, w.bx[k])) return false;
  return true;
}

/**
 * The leader line of chip `slot` from (x, y), the chip's bottom centre, toward its Rover's head (`w.hx`, `w.hy`): drawn while
 * the head sits at least `CHIP_ROW.lead` px under the chip and the drawn line crosses no HUD box and none of the row's other
 * `n` chips (`segmentHitsBox`; `self` its own index in the row: a top chip's line in two rows of dots passes between the
 * chips under it); every line stops at the wall-top level with a tick (on the wall's top edge, or beside the wall above
 * an end Rover, the tick clear of the HUD boxes; where that line would cross another chip, a phone's two rows of dots,
 * where the line itself meets the level), or runs faded to the head where the chip sits over the screens (`leadEnd`);
 * NaN hides it. A line that would still cross the HUD or a chip hides: the chip's colour and its Rover's
 * antenna still map it.
 */
function writeLead(w: WatchState, slot: number, x: number, y: number, n = 0, self = -1) {
  const lead = officeRuntime.leads[slot];
  if (!lead) return;
  let e = endLead(w, slot, x, y);
  let on = !Number.isNaN(x) && w.hy[slot] - y >= CHIP_ROW.lead && clearLead(w, x, y, e, n, self);
  if (!on && e.tick && !Number.isNaN(x) && w.hy[slot] - y >= CHIP_ROW.lead) on = clearLead(w, x, y, (e = endLead(w, slot, x, y, false)), n, self);
  const hx = e.x;
  const hy = e.y;
  writeTick(w, slot, on && e.tick ? Math.round(hx) : NaN, Math.round(hy));
  if (!on) {
    if (w.leadOn[slot]) {
      lead.style.visibility = "hidden";
      w.leadOn[slot] = false;
    }
    return;
  }
  if (w.leadFaded[slot] !== e.faded) {
    w.leadFaded[slot] = e.faded;
    lead.style.opacity = String(e.faded ? LEAD.faded : LEAD.opacity);
  }
  const dx = Math.round(hx - x);
  const length = Math.round(Math.hypot(dx, hy - y));
  const angle = Math.round(Math.atan2(-dx, hy - y) * 1000) / 1000;
  const last = w.lead[slot];
  if (last[0] !== x || last[1] !== y || last[2] !== length || last[3] !== angle) {
    last[0] = x;
    last[1] = y;
    last[2] = length;
    last[3] = angle;
    lead.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}rad)`;
    lead.style.height = `${length}px`;
  }
  if (!w.leadOn[slot]) {
    lead.style.visibility = "visible";
    w.leadOn[slot] = true;
  }
}

/** Whether any chip, leader line or tick is on screen (the watch has chip work to do even out of view). */
function anyChipShown(w: WatchState): boolean {
  for (let slot = 0; slot < w.shown.length; slot++) if (w.shown[slot] || w.leadOn[slot] || !Number.isNaN(w.tick[slot][0])) return true;
  return false;
}

/** One frame of `OfficeWatch` (a plain function, so the watch state it updates stays out of React's render rules). */
function watchFrame(w: WatchState, view: OfficeView, office: Rect, { camera, clock, size }: RootState) {
  const s = getHQStore().getState();
  const here = s.floor === "L1" && !s.ride && (s.phase === "explore" || s.phase === "room");
  const now = clock.elapsedTime;
  if (now >= w.next) {
    w.next = now + 0.5;
    w.box.min.set(office.minX, 0, office.minZ);
    w.box.max.set(office.maxX, OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame, office.maxZ);
    w.frustum.setFromProjectionMatrix(w.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const inView = here && w.frustum.intersectsBox(w.box);
    const distance = w.box.distanceToPoint(camera.position);
    const far = distance > OFFICE_LOD.farDistance;
    officeRuntime.inView = inView;
    officeRuntime.distance = distance;
    officeRuntime.far = far;
    // In view: the near (fast) or far (30 s) poll; out of view the scene's poller stops and the office watch takes over.
    officeLive.view(inView ? (far ? "far" : "near") : null);
    // While this chunk's poller runs, its feed drives the beacon's signal and the office watch stops fetching.
    const feeding = officeLive.wanted();
    if (officeSignal.sceneFeeding !== feeding) setOfficeSignal({ sceneFeeding: feeding });
    const crew = officeRuntime.crew.map((a) => ({ state: a.state, yaw: a.pose.yaw, flag: a.pose.flag, z: a.pose.z }));
    const drones = view.rovers.map((r) => Math.min(r.helpers, DRONES.max));
    Object.assign(sceneProbes.office, { desks: view.rovers.length, states: view.rovers.map((r) => r.state), mode: view.mode, inView, far, polling: feeding, crew, drones });
  }
  // Out of view with every chip already hidden: no chip work this frame.
  if (!officeRuntime.inView && !anyChipShown(w)) return;
  const mobile = s.device.viewport === "mobile";
  const mode = here ? officeChipMode(s.activeRoom) : null;
  // The committed layout (React has rendered the previous frame's flags by now), then this frame's.
  const small = mobile || officeRuntime.compact;
  const hud = hudLayout(s.device.viewport, s.device.coarse);
  const top = OFFICE_CHIP_TOP[hud === "phone" ? "mobile" : "desktop"];
  fitRow(w, size.width, size.height, hud, top, namedChips(view));
  const oneLine = chipsOneLine(s.device.viewport, mode === "compact", w.max);
  if (mode) setChipsCompact(mode === "compact" || chipsDotsOnly(w.max));
  let n = 0;
  for (let slot = 0; slot < officeRuntime.chips.length; slot++) {
    const el = officeRuntime.chips[slot];
    let on = false;
    if (el) {
      if (w.els[slot] !== el) {
        // A freshly mounted chip starts hidden (its inline style), its leader line and tick (mounted with it) too.
        w.els[slot] = el;
        w.shown[slot] = false;
        w.wFar[slot] = null;
        w.wMax[slot] = NaN;
        w.cx[slot] = w.cy[slot] = NaN;
        w.leadOn[slot] = w.leadFaded[slot] = false;
        w.lead[slot].fill(NaN);
        w.tick[slot].fill(NaN);
      }
      const a = OFFICE_CHIP_ANCHORS[slot];
      const dist = camera.position.distanceTo(w.v.set(a.x, a.y, a.z));
      on = mode !== null && officeRuntime.inView && (w.v.project(camera), w.v.z < 1 && Math.abs(w.v.x) <= 1 && Math.abs(w.v.y) <= 1);
      if (on) {
        // Read before this frame's far update: React has committed the previous flag's content by now.
        const far = officeRuntime.chipFar[slot];
        // The row's fit (`chipMaxWidth`) caps the chip's width; a new cap changes its size.
        if (w.wMax[slot] !== w.max) {
          w.wMax[slot] = w.max;
          el.style.maxWidth = `${w.max}px`;
          w.wFar[slot] = null;
        }
        if (w.wFar[slot] !== far || w.wSmall[slot] !== small || w.wView[slot] !== view) {
          w.wFar[slot] = far;
          w.wSmall[slot] = small;
          w.wView[slot] = view;
          w.half[slot] = el.offsetWidth / 2;
          w.h[slot] = el.offsetHeight;
        }
        // A far chip turns near only once the camera holds still (its wider line would push its neighbours along the
        // row while the camera zooms in); turning far is at once.
        const nextFar = nextChipFar(far, dist, oneLine);
        if (nextFar || roverRuntime.cameraSettled) setChipFar(slot, nextFar);
        w.hx[slot] = ((w.v.x + 1) / 2) * size.width;
        w.hy[slot] = ((1 - w.v.y) / 2) * size.height;
        w.tx[n] = w.hx[slot];
        w.th[n] = w.half[slot];
        w.ts[n] = slot;
        n++;
      }
    }
    if (!on) hideChip(w, slot, el);
  }
  layoutChipRows(w.tx, w.th, w.out, w.row, n, w.bounds);
  if (n) projectWallTop(w, camera, size.width, size.height);
  // Place the chips first (a second row of dots sits a dot and a gap lower), then draw the leader lines clear of them all.
  let chips = 0;
  for (let k = 0; k < n; k++) {
    const slot = w.ts[k];
    const el = w.els[slot]!;
    const half = w.th[k];
    const x = Math.round(w.out[k] * 2) / 2;
    const y = top + w.row[k] * (CHIP_ROW.dot + CHIP_ROW.gap);
    const b = w.bx[k];
    // Past the row's right bound only when the chips cannot fit: hidden (its box empty).
    if (x + half > w.bounds.right + 0.5) {
      b.x0 = b.x1 = NaN;
      hideChip(w, slot, el);
      continue;
    }
    b.x0 = x - half;
    b.y0 = y;
    b.x1 = x + half;
    b.y1 = y + w.h[slot];
    if (w.cx[slot] !== x - half || w.cy[slot] !== y) {
      w.cx[slot] = x - half;
      w.cy[slot] = y;
      el.style.transform = `translate3d(${(x - half).toFixed(1)}px, ${y}px, 0)`;
    }
    if (!w.shown[slot]) {
      el.style.visibility = "visible";
      el.style.opacity = "1";
      w.shown[slot] = true;
    }
    chips += 1;
  }
  for (let k = 0; k < n; k++) {
    const b = w.bx[k];
    if (!Number.isNaN(b.x0)) writeLead(w, w.ts[k], (b.x0 + b.x1) / 2, b.y1, n, k);
  }
  sceneProbes.office.chips = chips;
}

/**
 * Every 0.5 s: is the office in view on L1 (a frustum test of its bounds), and how far is the camera from those bounds
 * (`officeRuntime.distance`, `far` past `OFFICE_LOD.farDistance`)? That gates the per-frame work, the wall redraws, the
 * far level of detail and the polling ("near" or "far" in view; out of view the office watch polls). Every frame: lays the HTML chips out in one row under the HUD's top bar, each
 * over its Rover's head (`layoutChipRows`: nudged apart along x in the order of the heads, clear of the HUD boxes in the row's band),
 * with a leader line from the chip down to the head, as `officeChipMode` lets them (far and compact on phones at any
 * distance, one line where the row leaves a chip under `CHIP_ROW.near`, dots where it leaves no room for the names and
 * everywhere outside the office view, two rows of dots where one does not fit, `layoutChipRows`; a hidden chip
 * turns far again), and writes the probes. A chip's size is read only when it can change (a new element, its far flag,
 * its compact layout or the feed), and a style is written only when its value changes. Renders nothing.
 */
function OfficeWatch({ view }: { view: OfficeView }) {
  const tmp = useMemo(() => createWatchState(), []);
  const bounds = useMemo(() => officeBounds(), []);
  useEffect(
    () => () => {
      officeRuntime.inView = false;
      officeRuntime.distance = Infinity;
      officeRuntime.far = true;
      officeLive.view(null);
      setOfficeSignal({ sceneFeeding: false });
      // The chips live in the HUD and outlive a canvas remount: hide them (far), as a new watcher assumes they start hidden.
      officeRuntime.chips.forEach((el, slot) => {
        setChipFar(slot, true);
        if (!el) return;
        el.style.visibility = "hidden";
        el.style.opacity = "0";
      });
      for (const lead of [...officeRuntime.leads, ...officeRuntime.ticks]) if (lead) lead.style.visibility = "hidden";
    },
    [],
  );
  useFrame((state) => watchFrame(tmp, view, bounds, state));
  return null;
}

/**
 * The live L1 Agent Office (lazy chunk; the furniture shell is drawn by the main-path OfficeMount): ten Rovers on two
 * console rows, their faces and desk screens, the glow, the screen wall, the ten chips' positions and twelve
 * point-and-go targets (the office, GitHub and the ten desks).
 * Five draw calls here (parts, treads, screens, glow, wall), on programs L1 already has.
 */
export function OfficeScene({ tier, t }: { tier: GpuTier; t: OfficeTranslate }) {
  const feed = useOfficeFeed();
  const view = useMemo(() => officeView(feed), [feed]);
  // The beacon's signal from this feed while its poller runs (a frozen feed never writes): the same reading as the
  // watch's, an offline or disabled feed asks nothing, and the good answer's time keeps the 60 s window. The watch
  // chunk mirrors the signal to the minimap and loads the beacon, so it loads here too (it may not have yet).
  useEffect(() => {
    if (!officeLive.wanted() || feed.status === "idle" || feed.status === "loading") return;
    const sig = feed.status === "ready" ? signalFromBody(feed.snapshot, Date.now()) : null;
    setOfficeSignal({ asking: sig?.asking ?? [], deployAt: sig?.deployAt ?? null, goodAt: feed.fetchedAt });
    void loadOfficeWatch().catch(() => null);
  }, [feed]);
  const slots = SLOTS;
  const agents = view.rovers.map((r) => r.agent ?? "").join(",");
  useEffect(() => {
    const names = agents.split(",");
    return registerExtraInteractables(
      "L1",
      officeInteractables(OFFICE_SLOTS, {
        office: t("3d.target.office"),
        github: t("3d.target.github"),
        desk: (slot) => t("3d.target.desk", { n: slot + 1, agent: names[slot] ? t(`agent.${names[slot]}`) : t("3d.offDuty") }),
      }),
    );
  }, [agents, t]);
  useEffect(
    () => () => {
      Object.assign(sceneProbes.office, { loaded: false, desks: 0, states: [], chips: 0, bob: 0, inView: false, far: true, steps: 0, polling: false, crew: [], drones: [] });
    },
    [],
  );
  return (
    <OfficeReady>
      <OfficeRovers view={view} slots={slots} tier={tier} t={t} />
      <OfficeWall view={view} tier={tier} t={t} />
      <OfficeWatch view={view} />
    </OfficeReady>
  );
}
