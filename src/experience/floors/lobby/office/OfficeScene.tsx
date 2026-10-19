"use client";

import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  Frustum,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
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
import type { OfficeState } from "@/lib/office/protocol";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { createHoloMaterial, HOLO_MODE } from "../../../fx/holoFx";
import { neonColor } from "../../../fx/materials";
import { sceneProbes } from "../../../fx/probes";
import { useDispose } from "../../../fx/useDispose";
import { registerExtraInteractables } from "../../../interact/registry";
import { forgetDrawn, shownInScene, whenDrawn } from "../../../scene/drawnWork";
import { sceneTarget } from "../../../scene/postHandle";
import { precompileObject } from "../../../scene/precompile";
import { renderProbe } from "../../../scene/renderProbe";
import { RIDE_CULL_BOUNDS } from "../../../tower/rideCull";
import type { GpuTier } from "../../../types";
import { OFFICE, officeBounds, officeSlots, type OfficeSlot, type OfficeTranslate } from "../officeLayout";
import { officeInteractables } from "./interact";
import { officeLive, useOfficeFeed } from "./live";
import { ATLAS, ATLAS_CELLS, atlasCell, cellUv, dirtyCells, drawFace, drawScreen, FACE_FPS_MAX, faceCell, faceKey, screenCell, screenKey, uploadOrigin, type CanvasFonts, type Cell, type ScreenTexts } from "./officeAtlas";
import { AtlasClock, fadeLevel, fadeTag, RoverWrites, stepFade, WallGate, type Fade } from "./officeFrame";
import { officeView, screenInput, type OfficeRoverView, type OfficeView } from "./officeModel";
import { chipAnchor, GLOW_PER_ROVER, glowKey, PARTS_PER_ROVER, roverFrame, TREADS_PER_ROVER, writeDeskScreen, writeFace, writeGlow, writeRover } from "./officeRig";
import { OFFICE_STATE_STYLE, pose, poseOffset, slotPhase, STILL_T, stillPose } from "./officeVisual";
import { drawWall, WALL_CANVAS, wallModel, type WallModel } from "./officeWall";
import { OFFICE_CHIP_FAR, officeRuntime, setChipFar } from "./runtime";

const NO_RAYCAST = () => null;
const QUADS = 10;
/** Desk screens redraw at most this often (faces at most FACE_FPS_MAX on both tiers), only the cells whose frame key changed. */
const SCREEN_FPS = { full: 10, lite: 5 } as const;
const FRAME = new Matrix4();
const ORIGIN = new Vector2();

function cssFont(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

/** Reads the site fonts for canvas text, again once web fonts are ready (then `onReady` forces a redraw). */
function useCanvasFonts(onReady: () => void): RefObject<CanvasFonts> {
  const fonts = useRef<CanvasFonts>({ mono: "monospace", sans: "sans-serif" });
  useEffect(() => {
    const read = () => {
      fonts.current.mono = cssFont("--font-jetbrains", "monospace");
      fonts.current.sans = cssFont("--font-inter", "sans-serif");
      onReady();
    };
    read();
    void document.fonts?.ready.then(read);
  }, [onReady]);
  return fonts;
}

/** A canvas texture that is only ever drawn whole or patched: no mipmaps, linear filtering (performance review). */
function flatTexture(texture: Texture): Texture {
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Five faces then five desk screens as one merged quad mesh (one draw call, one atlas). */
function atlasQuads(slots: readonly OfficeSlot[]): BufferGeometry {
  const positions = new Float32Array(QUADS * 12);
  const uvs = new Float32Array(QUADS * 8);
  const index: number[] = [];
  for (let q = 0; q < QUADS; q++) {
    const [u0, v0, u1, v1] = cellUv(q < slots.length ? faceCell(q) : screenCell(q - slots.length));
    uvs.set([u0, v0, u1, v0, u1, v1, u0, v1], q * 8);
    const b = q * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  for (const s of slots) {
    writeFace(roverFrame(s, stillPose("asleep"), FRAME), positions, s.slot);
    writeDeskScreen(s, positions, slots.length + s.slot);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
  g.setAttribute("uv", new BufferAttribute(uvs, 2));
  g.setIndex(index);
  // The faces move with their Rovers: one fixed sphere around the whole office, so culling never trusts stale bounds.
  const b = officeBounds();
  g.boundingSphere = new Sphere(new Vector3((b.minX + b.maxX) / 2, 2, (b.minZ + b.maxZ) / 2), Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 3);
  return g;
}

/** Rest instances (every Rover asleep), attached at creation so precompile, bounds and culling see the final meshes. */
function restInstances(slots: readonly OfficeSlot[]) {
  const parts = new Float32Array(slots.length * PARTS_PER_ROVER * 16);
  const treads = new Float32Array(slots.length * TREADS_PER_ROVER * 16);
  const glow = new Float32Array(slots.length * GLOW_PER_ROVER * 16);
  const colors = new Float32Array(slots.length * GLOW_PER_ROVER * 3);
  const p = stillPose("asleep");
  for (const s of slots) {
    roverFrame(s, p, FRAME);
    writeRover(FRAME, p, parts, s.slot, treads);
    writeGlow(s, FRAME, "asleep", null, 1, 0, true, OFFICE.stop, glow, colors);
  }
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

/** Writes the marked Rovers (instance matrices, face quads, glow) from the poses `writes` recorded, then clears their marks. */
function flushRovers(writes: RoverWrites, slots: readonly OfficeSlot[], rovers: readonly OfficeRoverView[], now: number, reduced: boolean, m: RoverMeshes): void {
  const position = m.quads.geometry.getAttribute("position") as BufferAttribute;
  let posed = false;
  let glowed = false;
  for (const r of rovers) {
    const slot = r.slot;
    const poseDue = writes.posePending[slot];
    const glowDue = writes.glowPending[slot];
    if (!poseDue && !glowDue) continue;
    const p = writes.poses[slot];
    roverFrame(slots[slot], p, FRAME);
    if (poseDue) {
      writeRover(FRAME, p, m.parts.instanceMatrix.array as Float32Array, slot, m.treads.instanceMatrix.array as Float32Array);
      writeFace(FRAME, position.array as Float32Array, slot);
      posed = true;
    }
    if (glowDue) {
      writeGlow(slots[slot], FRAME, r.state, r.progress, p.tipScale, now, reduced, writes.cam, m.glow.instanceMatrix.array as Float32Array, m.glow.instanceColor!.array as Float32Array);
      glowed = true;
    }
    writes.done(slot);
  }
  if (posed) {
    m.parts.instanceMatrix.needsUpdate = true;
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
  fps: number;
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
  const { rovers, now, reduced, fps, fonts, texts, t } = a;
  for (const r of rovers) {
    l.fades[r.slot] = stepFade(l.states[r.slot], r.state, l.fades[r.slot], reduced, now);
    l.states[r.slot] = r.state;
  }
  l.clock.tick(now, fps);
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
    l.primed = true;
    map.needsUpdate = true;
  }
}

/**
 * The five office Rovers: light parts and treads (two instanced standard meshes with `alphaHash`, the player
 * Rover's wheel program), their faces and the desk screens (one quad mesh on one canvas atlas, the player
 * face's material settings), and the glow (one instanced holo mesh: antenna tips, halos, progress dots).
 * Nothing is written while no pose, glow key or camera changed; the atlas uploads only its changed cells.
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
  const atlas = useMemo(() => flatTexture(new Texture(makeCanvas(ATLAS.w, ATLAS.h))), []);
  useDispose(atlas);
  // Cell-sized sources for the partial uploads (never drawn as textures themselves).
  const faceSrc = useMemo(() => flatTexture(new Texture(makeCanvas(atlasCell(0).w, atlasCell(0).h))), []);
  useDispose(faceSrc);
  const screenSrc = useMemo(() => flatTexture(new Texture(makeCanvas(atlasCell(ATLAS_CELLS / 2).w, atlasCell(ATLAS_CELLS / 2).h))), []);
  useDispose(screenSrc);
  const screens = useMemo(() => new MeshBasicMaterial({ map: atlas, color: neonColor("#ffffff", 1.6, tier), toneMapped: false, alphaHash: true }), [atlas, tier]);
  useDispose(screens);
  const quads = useMemo(() => atlasQuads(slots), [slots]);
  useDispose(quads);
  const rest = useMemo(() => restInstances(slots), [slots]);
  const writes = useMemo(() => new RoverWrites(slots.length, stillPose("asleep"), glowKey("asleep", null, true, 0), OFFICE.stop), [slots]);
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

  useEffect(() => {
    // The chips start over the sleeping Rovers (their anchors are written again only when a pose changes).
    for (const s of slots) chipAnchor(roverFrame(s, stillPose("asleep"), FRAME), officeRuntime.anchors[s.slot]);
    const g = group.current;
    return () => {
      if (g) forgetDrawn(g);
    };
  }, [slots]);

  useFrame(({ clock, camera, gl }) => {
    const g = group.current;
    const P = parts.current;
    const D = treads.current;
    const G = glows.current;
    const Q = screenMesh.current;
    if (!g || !P || !D || !G || !Q || !officeRuntime.inView) return;
    const now = clock.elapsedTime;
    let bob = 0;
    for (const r of view.rovers) {
      const p = pose(r.state, now, slotPhase(r.slot), reduced);
      bob = Math.max(bob, poseOffset(r.state, p));
      if (writes.pose(r.slot, p)) chipAnchor(roverFrame(slots[r.slot], p, FRAME), officeRuntime.anchors[r.slot]);
      writes.glow(r.slot, glowKey(r.state, r.progress, reduced, now));
    }
    writes.camera(camera.position.x, camera.position.z);
    sceneProbes.office.bob = bob;
    if (writes.pending()) {
      const rovers = view.rovers;
      // Only how the meshes look: wait for a drawn frame (a hidden L1 or the office before its precompile skips it).
      whenDrawn(g, () => flushRovers(writes, slots, rovers, now, reduced, { parts: P, treads: D, glow: G, quads: Q }));
    }
    paintAtlas(gl, g, Q, local.current, { rovers: view.rovers, now, reduced, fps, fonts: fonts.current, texts, t });
  });

  return (
    <group ref={group} name="office-rovers">
      <instancedMesh ref={parts} args={[box, light, slots.length * PARTS_PER_ROVER]} raycast={NO_RAYCAST} name="office-rover-parts">
        <instancedBufferAttribute attach="instanceMatrix" args={[rest.parts, 16]} usage={DynamicDrawUsage} />
      </instancedMesh>
      <instancedMesh ref={treads} args={[box, dark, slots.length * TREADS_PER_ROVER]} raycast={NO_RAYCAST} name="office-rover-treads">
        <instancedBufferAttribute attach="instanceMatrix" args={[rest.treads, 16]} usage={DynamicDrawUsage} />
      </instancedMesh>
      <mesh ref={screenMesh} geometry={quads} material={screens} raycast={NO_RAYCAST} name="office-screens" />
      <instancedMesh ref={glows} args={[dot, glow, slots.length * GLOW_PER_ROVER]} raycast={NO_RAYCAST} name="office-glow" renderOrder={1}>
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
  const texture = useMemo(() => flatTexture(new CanvasTexture(makeCanvas(size.w, size.h))), [size]);
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
      position={[OFFICE.wall.x, OFFICE.wall.bottom + OFFICE.wall.h / 2, OFFICE.wall.z - OFFICE.wall.t / 2 - 0.01]}
      rotation={[0, Math.PI, 0]}
    />
  );
}

/**
 * Every 0.5 s: is the office in view on L1 (a frustum test of its bounds)? That gates the per-frame work, the
 * wall redraws and the polling ("view"). Every frame: moves the HTML chips over their Rovers (HintProbe pattern)
 * and writes the probes. Renders nothing.
 */
function OfficeWatch({ view }: { view: OfficeView }) {
  const tmp = useMemo(() => ({ box: new Box3(), frustum: new Frustum(), m: new Matrix4(), v: new Vector3() }), []);
  const bounds = useMemo(() => officeBounds(), []);
  const next = useRef(0);
  useEffect(
    () => () => {
      officeRuntime.inView = false;
      officeLive.want("view", false);
    },
    [],
  );
  useFrame(({ camera, clock, size }) => {
    const s = getHQStore().getState();
    const here = s.floor === "L1" && !s.ride && (s.phase === "explore" || s.phase === "room");
    const now = clock.elapsedTime;
    if (now >= next.current) {
      next.current = now + 0.5;
      tmp.box.min.set(bounds.minX, 0, bounds.minZ);
      tmp.box.max.set(bounds.maxX, OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame, bounds.maxZ);
      tmp.frustum.setFromProjectionMatrix(tmp.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const inView = here && tmp.frustum.intersectsBox(tmp.box);
      officeRuntime.inView = inView;
      officeLive.want("view", inView);
      Object.assign(sceneProbes.office, { desks: view.rovers.length, states: view.rovers.map((r) => r.state), mode: view.mode, inView, polling: officeLive.wanted() });
    }
    let chips = 0;
    officeRuntime.chips.forEach((el, slot) => {
      if (!el) return;
      const a = officeRuntime.anchors[slot];
      tmp.v.set(a.x, a.y, a.z);
      setChipFar(slot, camera.position.distanceTo(tmp.v) > OFFICE_CHIP_FAR);
      tmp.v.project(camera);
      const on = here && officeRuntime.inView && tmp.v.z < 1 && Math.abs(tmp.v.x) <= 1 && Math.abs(tmp.v.y) <= 1;
      const x = ((tmp.v.x + 1) / 2) * size.width;
      const y = ((1 - tmp.v.y) / 2) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      el.style.visibility = on ? "visible" : "hidden";
      el.style.opacity = on ? "1" : "0";
      if (on) chips += 1;
    });
    sceneProbes.office.chips = chips;
  });
  return null;
}

/**
 * The live L1 Agent Office (lazy chunk; the furniture shell is drawn by the main-path OfficeMount): five Rovers,
 * their faces and desk screens, the glow, the screen wall, the chips' positions and seven point-and-go targets.
 * Five draw calls here (parts, treads, screens, glow, wall), on programs L1 already has.
 */
export function OfficeScene({ tier, t }: { tier: GpuTier; t: OfficeTranslate }) {
  const feed = useOfficeFeed();
  const view = useMemo(() => officeView(feed), [feed]);
  const slots = useMemo(() => officeSlots(), []);
  const agents = view.rovers.map((r) => r.agent ?? "").join(",");
  useEffect(() => {
    const names = agents.split(",");
    return registerExtraInteractables(
      "L1",
      officeInteractables(slots, {
        office: t("3d.target.office"),
        github: t("3d.target.github"),
        desk: (slot) => t("3d.target.desk", { n: slot + 1, agent: names[slot] ? t(`agent.${names[slot]}`) : t("3d.offDuty") }),
      }),
    );
  }, [agents, slots, t]);
  useEffect(
    () => () => {
      Object.assign(sceneProbes.office, { loaded: false, desks: 0, states: [], chips: 0, bob: 0, inView: false, polling: false });
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
