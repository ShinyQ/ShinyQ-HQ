"use client";

import { Text } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ACESFilmicToneMapping } from "three";
import type { RoomId } from "@/content/schema";
import { DrawerHost } from "@/hud/drawer/DrawerHost";
import { openPaperFor } from "@/hud/drawer/paper";
import { getHQStore } from "@/store/useHQStore";
import "../../text-config";
import { COLORS, FLOOR_COLOR, ROVER, SHAFT } from "../../config";
import { CONCEPT_BUILDERS } from "../../floors/library/concepts";
import { CONCEPT_DECOR } from "../../floors/library/decor";
import { LIBRARY_CONCEPTS, LIBRARY_FLOOR, libraryLayoutInput, type LibraryConcept, type LibraryZone } from "../../floors/library/model";
import { GridFloor } from "../../fx/GridFloor";
import { RoadMarkings } from "../../fx/RoadMarkings";
import { isMoveKey } from "../../input/intents";
import { buildNavGrid, findPath } from "../../nav/navgrid";
import { buildRoadGraph } from "../../nav/road";
import { roadRoute } from "../../nav/roadRoute";
import { spaceViolations } from "../../nav/space";
import { FONTS } from "../../tower/primitives";
import type { ExperienceData, GpuTier, LibraryData, Vec2 } from "../../types";
import { Driver, resetRover, RoverMesh, sim, startLeg, type ProtoFloor, type View } from "../FloorsPrototype";

interface Params {
  concept: LibraryConcept;
  view: View;
  tier: GpuTier;
  reduced: boolean;
  /** Total post count, padded with FICTIONAL sample posts (dev only) to preview the archive board. */
  posts: number;
  at: Vec2 | null;
}

function readParams(): Params {
  const fallback: Params = { concept: "atrium", view: "rover", tier: "full", reduced: false, posts: 0, at: null };
  if (typeof window === "undefined") return fallback;
  const q = new URLSearchParams(window.location.search);
  const concept = q.get("concept") as LibraryConcept | null;
  const [x, z] = (q.get("at") ?? "").split(",").map(Number);
  return {
    concept: concept && LIBRARY_CONCEPTS.includes(concept) ? concept : "atrium",
    view: q.get("view") === "top" ? "top" : "rover",
    tier: q.get("tier") === "lite" ? "lite" : "full",
    reduced: q.get("motion") === "reduce",
    posts: Number(q.get("posts")) || 0,
    at: q.get("at") && Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null,
  };
}

/** Pads the real posts with FICTIONAL samples (never shipped: this route is dev only) up to `total`. */
function withSamples(library: LibraryData, total: number): LibraryData {
  if (total <= library.posts.length) return library;
  const extra = Array.from({ length: total - library.posts.length }, (_, i) => ({
    slug: `sample-post-${i + 1}`,
    title: `Sample post ${i + 1}`,
    date: `20${String(19 - (i % 8)).padStart(2, "0")}-06-01`,
    languages: ["en" as const],
    tags: ["sample"],
    url: null,
  }));
  return { ...library, posts: [...library.posts, ...extra] };
}

/** Marks the prototype ready once frames have rendered (screenshot scripts wait for `data-ready`). */
function Ready() {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 45) document.querySelector("[data-testid='library-prototype']")?.setAttribute("data-ready", "");
  });
  return null;
}

/** Copies the renderer's draw calls and triangles to the root (`data-calls`, `data-triangles`) every 0.25 s. */
function BudgetMeter() {
  const { gl } = useThree();
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.25) return;
    last.current = clock.elapsedTime;
    const root = document.querySelector<HTMLElement>("[data-testid='library-prototype']");
    if (!root) return;
    root.dataset.calls = String(gl.info.render.calls);
    root.dataset.triangles = String(gl.info.render.triangles);
  });
  return null;
}

const seg = (on: boolean) =>
  `inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold transition ${on ? "bg-amber text-void" : "border border-glass-border text-ink-2 hover:text-ink"}`;

/**
 * Dev-only playable prototype of the three L4 Writing concepts (owner pick): the real layouts, decor,
 * Glass Drawer and paper modal on a simulated rover, at /{locale}/dev/library.
 */
export default function LibraryPrototype({ data }: { data: ExperienceData }) {
  const tp = useTranslations("proto");
  const tl = useTranslations("proto.library");
  const tLib = useTranslations("library");
  const [initial] = useState(readParams);
  const [concept, setConcept] = useState<LibraryConcept>(initial.concept);
  const [view, setView] = useState<View>(initial.view);
  const [viewport, setViewport] = useState({ w: 1440, h: 900 });
  const [budget, setBudget] = useState({ calls: 0, triangles: 0 });

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    getHQStore().getState().setReducedMotion(initial.reduced);
  }, [initial.reduced]);

  const library = useMemo(() => withSamples(data.library, initial.posts), [data.library, initial.posts]);
  const zones: Record<LibraryZone, string> = useMemo(() => ({ blog: tLib("posts"), research: tLib("research"), models: tLib("publications"), talks: tLib("talks") }), [tLib]);
  const layout = useMemo(() => CONCEPT_BUILDERS[concept](libraryLayoutInput(library)), [concept, library]);
  const floor: ProtoFloor = useMemo(
    () => ({ id: "L4", bounds: layout.floor.bounds, network: layout.network, obstacles: layout.floor.obstacles, doors: layout.floor.doors ?? [], approach: layout.floor.approach, accent: FLOOR_COLOR.L4 }),
    [layout],
  );
  const grid = useMemo(() => buildNavGrid(floor, ROVER.radius), [floor]);
  const graph = useMemo(() => buildRoadGraph(floor.network), [floor]);
  const violations = useMemo(() => spaceViolations({ ...floor, start: floor.approach }), [floor]);

  useEffect(() => {
    resetRover(initial.at ?? layout.floor.spawn);
    getHQStore().getState().closeRoom();
  }, [layout, initial.at]);

  // Keyboard driving (WASD and arrows); the drawer and dialogs keep their own keys.
  useEffect(() => {
    const keys = sim.keys;
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea, [role='dialog']")) return;
      if (isMoveKey(e.key)) {
        keys.add(e.key.toLowerCase());
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const root = document.querySelector<HTMLElement>("[data-testid='library-prototype']");
      setBudget({ calls: Number(root?.dataset.calls ?? 0), triangles: Number(root?.dataset.triangles ?? 0) });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const drive = useCallback(
    (to: Vec2, road: boolean) => startLeg(road ? roadRoute(floor.network, grid, sim.controller.pose, to, graph) : findPath(grid, sim.controller.pose, to)),
    [floor, grid, graph],
  );
  const doorOf = useCallback((room: RoomId) => floor.doors.find((d) => d.room === room)?.at ?? null, [floor]);
  const openStation = useCallback(
    (room: RoomId) => {
      const at = doorOf(room);
      if (!at) return;
      void drive(at, true).then((status) => status === "done" && getHQStore().getState().openRoom(room));
    },
    [doorOf, drive],
  );

  const compact = viewport.w < 640;
  const Decor = CONCEPT_DECOR[concept];
  const b = layout.floor.bounds;
  const pad = LIBRARY_FLOOR.padZone;
  const docked = layout.stations.filter((s) => s.zone === "blog").length;

  const panelBody = (
    <>
      <p className="eyebrow text-amber">{tl("title")}</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={tl("concept")}>
        {LIBRARY_CONCEPTS.map((id) => (
          <button key={id} type="button" className={seg(concept === id)} aria-pressed={concept === id} onClick={() => setConcept(id)} data-concept={id}>
            {tl(id)}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={tp("view")}>
        {(["rover", "top"] as const).map((v) => (
          <button key={v} type="button" className={seg(view === v)} aria-pressed={view === v} onClick={() => setView(v)}>
            {tp(v)}
          </button>
        ))}
      </div>
      <p className="label mt-2 text-ink-3">{tp("size", { w: Math.round(b.maxX - b.minX), d: Math.round(b.maxZ - b.minZ), rooms: layout.stations.length, plazas: layout.network.plazas.length })}</p>
      <p className="label text-ink-3">{tl("posts", { count: docked, archive: layout.archive.length })}</p>
      <p className="label text-ink-3" data-testid="proto-rules">
        {tp("rules")}: <span className={violations.length ? "text-pink" : "text-green"}>{violations.length ? tp("violations", { count: violations.length }) : tp("pass")}</span>
      </p>
      <p className="label text-ink-3" data-testid="proto-budget">
        {tl("budget", { calls: budget.calls, triangles: budget.triangles })}
      </p>
      <p className="mt-1 hidden text-xs text-ink-3 md:block">{tp("hint")}</p>
    </>
  );

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-void text-ink" data-testid="library-prototype" data-concept={concept} data-view={view}>
      <Canvas
        dpr={initial.tier === "full" ? [1, 2] : [1, 1.5]}
        gl={{ antialias: true }}
        camera={{ fov: 40, near: 0.5, far: 2000, position: [0, 60, 60] }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
        }}
      >
        <color attach="background" args={[COLORS.void]} />
        <hemisphereLight args={["#c7d2fe", "#05050c", 0.9]} />
        <directionalLight position={[20, 40, 10]} intensity={0.8} />
        <mesh
          position={[(b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(e: ThreeEvent<MouseEvent>) => void drive({ x: e.point.x, z: e.point.z }, false)}
        >
          <planeGeometry args={[b.maxX - b.minX, b.maxZ - b.minZ]} />
          <meshBasicMaterial color="#0a0a12" />
        </mesh>
        <GridFloor width={b.maxX - b.minX} depth={b.maxZ - b.minZ} center={[(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]} />
        <RoadMarkings network={layout.network} color={FLOOR_COLOR.L4} tier={initial.tier} reducedMotion={initial.reduced} chevronSpacing={5} />
        <Decor
          layout={layout}
          library={library}
          tier={initial.tier}
          reducedMotion={initial.reduced}
          zones={zones}
          onStation={openStation}
          onPaper={(id) => void openPaperFor(data.locale, id)}
        />
        {/* Elevator shaft and the reserved call pad spot (parallel work). */}
        <mesh position={[SHAFT.x, 3, SHAFT.z]}>
          <boxGeometry args={[SHAFT.size, 6, SHAFT.size]} />
          <meshStandardMaterial color="#111827" emissive={FLOOR_COLOR.L4} emissiveIntensity={0.15} transparent opacity={0.7} />
        </mesh>
        <mesh position={[(pad.minX + pad.maxX) / 2, 0.04, (pad.minZ + pad.maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[pad.maxX - pad.minX, pad.maxZ - pad.minZ]} />
          <meshBasicMaterial color={COLORS.amber} transparent opacity={0.12} depthWrite={false} toneMapped={false} />
        </mesh>
        <Text font={FONTS.mono} fontSize={0.5} color={COLORS.amber} position={[(pad.minX + pad.maxX) / 2, 0.06, pad.maxZ + 0.6]} rotation={[-Math.PI / 2, 0, 0]} anchorX="center">
          {tl("pad")}
        </Text>
        <RoverMesh />
        <Driver floor={floor} view={view} />
        <BudgetMeter />
        <Ready />
      </Canvas>

      {compact ? (
        <details className="glass glass-solid pointer-events-auto absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] p-2 text-sm" data-testid="proto-panel">
          <summary className="label min-h-11 cursor-pointer content-center px-2 text-amber">{tl("title")}</summary>
          <div className="p-1">{panelBody}</div>
        </details>
      ) : (
        <section className="glass glass-solid pointer-events-auto absolute top-3 left-3 w-[min(360px,calc(100%-1.5rem))] p-3 text-sm" data-testid="proto-panel">
          {panelBody}
        </section>
      )}

      <DrawerHost locale={data.locale} />
    </div>
  );
}
