"use client";

import { Billboard, Edges, RoundedBox, Text } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ACESFilmicToneMapping, Vector3, type Group } from "three";
import type { RoomId } from "@/content/schema";
import "../text-config";
import { COLORS, FLOOR_COLOR, ROVER } from "../config";
import { buildCareerRoad, CAREER_ROAD, careerLayoutInput, type CareerRoadLayout, type RoadStyle } from "../floors/career/layout";
import { TypeIcon } from "@/components/TypeIcon";
import { GridFloor } from "../fx/GridFloor";
import { HoloIcon } from "../fx/HoloIcon";
import { CAREER_ICONS, CAREER_TONE } from "../fx/holoIcons";
import { RoadMarkings } from "../fx/RoadMarkings";
import { isMoveKey, moveVectorFromKeys } from "../input/intents";
import type { MissionStatus } from "../missions/host";
import { buildNavGrid, findPath } from "../nav/navgrid";
import { buildRoadGraph, type RoadNetwork } from "../nav/road";
import { roadRoute } from "../nav/roadRoute";
import { spaceViolations } from "../nav/space";
import { RoverController } from "../rover/controller";
import { cameraRelative } from "../rover/movement";
import { FONTS } from "../tower/primitives";
import type { CareerType, DoorTrigger, ExperienceData, GpuTier, Rect, Vec2 } from "../types";
import { buildLabsLayout, WING_TINT as WING_COLOR, type LabsLayout } from "../floors/labs/layout";

/** Spur stubs take the career type colors. */
function recolor(road: CareerRoadLayout): RoadNetwork {
  const type = new Map(road.rooms.map((r) => [r.id, r.type]));
  return { ...road.network, spurs: road.network.spurs.map((sp) => ({ ...sp, color: type.has(sp.room) ? CAREER_TONE[type.get(sp.room)!] : sp.color })) };
}

/** Floor-independent slice the simulation needs (also used by the L4 concepts prototype). */
export interface ProtoFloor {
  id: "L2" | "L3" | "L4";
  bounds: Rect;
  network: RoadNetwork;
  obstacles: Rect[];
  doors: DoorTrigger[];
  approach: Vec2;
  accent: string;
}

export type View = "rover" | "top";

interface Sim {
  controller: RoverController;
  keys: Set<string>;
  /** Running autopilot leg: resolves when the rover arrives or the leg is cancelled. */
  leg: { resolve: (status: MissionStatus) => void } | null;
  cameraForward: Vec2;
}

/** Prototype simulation state, mutated in useFrame and event handlers (like `roverRuntime`). */
export const sim: Sim = { controller: new RoverController({ x: -21, z: 0 }, Math.PI / 2), keys: new Set(), leg: null, cameraForward: { x: 0, z: -1 } };

/** Ends the running leg (manual input, a new leg or a reset). */
function cancelLeg() {
  sim.leg?.resolve("cancelled");
  sim.leg = null;
  sim.controller.clearPath();
}

/** Autopilots the prototype rover along `path`; resolves when it arrives or the leg is cancelled. */
export function startLeg(path: Vec2[] | null): Promise<MissionStatus> {
  cancelLeg();
  if (!path?.length) return Promise.resolve("done");
  return new Promise((resolve) => {
    sim.controller.setPath(path, true);
    sim.leg = { resolve };
  });
}

export function resetRover(at: Vec2) {
  cancelLeg();
  sim.controller = new RoverController(at, Math.PI / 2);
}

function readParams() {
  if (typeof window === "undefined") return { floor: "L2" as const, road: "meander" as RoadStyle, view: "rover" as View, tier: "full" as GpuTier, sheet: false, at: null as Vec2 | null };
  const q = new URLSearchParams(window.location.search);
  return {
    floor: (q.get("floor") === "L3" ? "L3" : "L2") as "L2" | "L3",
    road: (q.get("road") === "straight" ? "straight" : "meander") as RoadStyle,
    view: (q.get("view") === "top" ? "top" : "rover") as View,
    tier: (q.get("tier") === "lite" ? "lite" : "full") as GpuTier,
    sheet: q.get("sheet") === "1",
    at: (() => {
      const [x, z] = (q.get("at") ?? "").split(",").map(Number);
      return Number.isFinite(x) && Number.isFinite(z) && q.get("at") ? { x, z } : null;
    })(),
  };
}

/* ------------------------------------------------------------------ world */

export function RoverMesh() {
  const group = useRef<Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const p = sim.controller.pose;
    g.position.set(p.x, 0, p.z);
    g.rotation.set(0, p.heading, 0);
  });
  return (
    <group ref={group}>
      <RoundedBox args={[1.5, 1.1, 1.3]} radius={0.25} position={[0, 0.75, 0]}>
        <meshStandardMaterial color="#1f2937" emissive="#34d399" emissiveIntensity={0.25} />
      </RoundedBox>
      <mesh position={[0, 0.8, 0.66]}>
        <planeGeometry args={[1.1, 0.6]} />
        <meshBasicMaterial color="#34d399" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.1, 1.3, 32]} />
        <meshBasicMaterial color="#34d399" transparent opacity={0.5} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Label({ position, title, sub, color = COLORS.white }: { position: [number, number, number]; title: string; sub?: string; color?: string }) {
  return (
    <Billboard position={position}>
      <Text font={FONTS.sansBold} fontSize={0.62} maxWidth={9} textAlign="center" anchorX="center" anchorY="bottom" color={color} outlineWidth={0.04} outlineColor="#05050c">
        {title}
      </Text>
      {sub && (
        <Text font={FONTS.mono} fontSize={0.4} maxWidth={9} textAlign="center" anchorX="center" anchorY="top" position={[0, -0.12, 0]} color="#a1a1aa" outlineWidth={0.03} outlineColor="#05050c">
          {sub}
        </Text>
      )}
    </Billboard>
  );
}

function Tile({ rect, color, opacity = 0.1, y = 0.02 }: { rect: Rect; color: string; opacity?: number; y?: number }) {
  return (
    <mesh position={[(rect.minX + rect.maxX) / 2, y, (rect.minZ + rect.maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <planeGeometry args={[rect.maxX - rect.minX, rect.maxZ - rect.minZ]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Wire({ rect, h, color }: { rect: Rect; h: number; color: string }) {
  return (
    <mesh position={[(rect.minX + rect.maxX) / 2, h / 2, (rect.minZ + rect.maxZ) / 2]} raycast={() => null}>
      <boxGeometry args={[rect.maxX - rect.minX, h, rect.maxZ - rect.minZ]} />
      <meshBasicMaterial visible={false} />
      <Edges color={color} transparent opacity={0.75} toneMapped={false} />
    </mesh>
  );
}

function rectOf(c: Vec2, w: number, d: number): Rect {
  return { minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - d / 2, maxZ: c.z + d / 2 };
}

const TYPES: readonly CareerType[] = ["job", "freelance", "education", "award", "milestone"];

function CareerDecor({
  road,
  labels,
  titles,
  onRoom,
  tier,
}: {
  tier: GpuTier;
  road: CareerRoadLayout;
  labels: { rooms: (n: number) => string; workshop: string };
  titles: Map<string, { title: string; sub?: string }>;
  onRoom: (room: RoomId) => void;
}) {
  const accent = FLOOR_COLOR.L2;
  const instances = useMemo(() => {
    const out = {} as Record<CareerType, { x: number; y: number; z: number; face: number }[]>;
    for (const type of TYPES) out[type] = road.rooms.filter((r) => r.type === type).map((r) => ({ x: r.center.x, y: 2.5, z: r.center.z, face: r.side === -1 ? 0 : Math.PI }));
    return out;
  }, [road]);
  return (
    <group>
      {TYPES.map((type) => (
        <HoloIcon key={type} strokes={CAREER_ICONS[type]} instances={instances[type]} color={CAREER_TONE[type]} tier={tier} reducedMotion={false} />
      ))}
      {road.years.map((y) => (
        <group key={y.year}>
          {/* Arch over the road with the year and a signpost. */}
          <group position={[y.arch.center.x, 0, y.arch.center.z]} rotation={[0, y.arch.angle - Math.PI / 2, 0]}>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[0, 2.4, s * (CAREER_ROAD.width / 2 + 1)]}>
                <boxGeometry args={[0.6, 4.8, 0.6]} />
                <meshStandardMaterial color="#111827" emissive={accent} emissiveIntensity={0.6} />
              </mesh>
            ))}
            <mesh position={[0, 5, 0]}>
              <boxGeometry args={[0.6, 0.5, CAREER_ROAD.width + 2.6]} />
              <meshStandardMaterial color="#111827" emissive={accent} emissiveIntensity={0.9} />
            </mesh>
            <Text font={FONTS.monoBold} fontSize={2} color={accent} anchorX="center" anchorY="bottom" position={[0, 5.4, 0]} rotation={[0, Math.PI / 2, 0]} material-toneMapped={false}>
              {String(y.year)}
            </Text>
            <Text font={FONTS.mono} fontSize={0.55} color={COLORS.white} anchorX="center" anchorY="top" position={[0, 4.6, 0]} rotation={[0, Math.PI / 2, 0]}>
              {`${y.year} · ${labels.rooms(y.rooms.length)} →`}
            </Text>
          </group>
          {/* Big year digits on the plaza floor (readable from the top-down view). */}
          <Text
            font={FONTS.monoBold}
            fontSize={5}
            color={accent}
            fillOpacity={0.35}
            anchorX="center"
            anchorY="middle"
            position={[y.plaza.center.x, 0.04, y.plaza.center.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            material-toneMapped={false}
          >
            {String(y.year)}
          </Text>
          {y.rooms.map((r) => {
            const rect = rectOf(r.center, r.w, r.d);
            const color = CAREER_TONE[r.type];
            return (
              <group key={r.id}>
                <mesh
                  position={[r.center.x, 0.015, r.center.z]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  onClick={(e: ThreeEvent<MouseEvent>) => {
                    e.stopPropagation();
                    onRoom(r.id);
                  }}
                >
                  <planeGeometry args={[r.w, r.d]} />
                  <meshBasicMaterial color={color} transparent opacity={0.1} depthWrite={false} toneMapped={false} />
                </mesh>
                <Wire rect={rect} h={2.2} color={color} />
                <mesh position={[r.center.x, 0.2, r.center.z]}>
                  <cylinderGeometry args={[CAREER_ROAD.pedestal / 2, CAREER_ROAD.pedestal / 2 + 0.1, 0.4, 6]} />
                  <meshStandardMaterial color="#0f172a" emissive={color} emissiveIntensity={0.5} />
                </mesh>
                <Label position={[r.center.x, 4.9, r.center.z]} title={titles.get(r.id)?.title ?? r.slug} sub={titles.get(r.id)?.sub} color={color} />
              </group>
            );
          })}
        </group>
      ))}
      {road.workshop.obstacles.map((r, i) => (
        <Tile key={i} rect={r} color={accent} opacity={0.6} />
      ))}
      <Label position={[road.workshop.gateway.x, 6.2, 0]} title={labels.workshop} color={accent} />
    </group>
  );
}

function LabsDecor({ labs, wings, labels, onRoom }: { labs: LabsLayout; wings: Record<"software" | "ai", string>; labels: { more: string; loop: string }; onRoom: (room: RoomId) => void }) {
  return (
    <group>
      {labs.placed.map((p) => {
        const color = WING_COLOR[p.pod.wing];
        const h = p.pod.tier === "hero" ? 3 : 2.4;
        return (
          <group key={p.room}>
            <Tile rect={p.forecourt} color={color} opacity={0.06} y={0.018} />
            <mesh
              position={[p.center.x, h / 2, p.center.z]}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onRoom(p.room);
              }}
            >
              <boxGeometry args={[p.rect.maxX - p.rect.minX, h, p.rect.maxZ - p.rect.minZ]} />
              <meshStandardMaterial color="#0b1020" emissive={color} emissiveIntensity={0.12} transparent opacity={0.55} />
            </mesh>
            <Wire rect={p.rect} h={h} color={color} />
            <Label position={[p.center.x, h + 1.4, p.center.z]} title={p.pod.title} sub={p.pod.tier === "hero" ? "Key project" : "Featured"} color={color} />
          </group>
        );
      })}
      {(["software", "ai"] as const).map((wing) => {
        const b = labs.boards[wing];
        return (
          <group key={wing}>
            <mesh position={[b.center.x, 2, b.center.z]}>
              <boxGeometry args={[b.maxX - b.minX, 4, b.maxZ - b.minZ]} />
              <meshStandardMaterial color="#0b1020" emissive={WING_COLOR[wing]} emissiveIntensity={0.4} />
            </mesh>
            <Label position={[b.center.x, 5.2, b.center.z]} title={wings[wing]} sub={`${labels.more} (${labs.directory[wing].length})`} color={WING_COLOR[wing]} />
            <Text
              font={FONTS.monoBold}
              fontSize={1.4}
              color={WING_COLOR[wing]}
              anchorX="center"
              anchorY="middle"
              position={[labs.signs[wing].at.x, 0.05, labs.signs[wing].at.z]}
              rotation={[-Math.PI / 2, 0, 0]}
              material-toneMapped={false}
            >
              {`${wings[wing]} →`}
            </Text>
          </group>
        );
      })}
      <Text font={FONTS.monoBold} fontSize={2.4} color={FLOOR_COLOR.L3} fillOpacity={0.4} anchorX="center" anchorY="middle" position={[labs.east.center.x, 0.05, labs.east.center.z]} rotation={[-Math.PI / 2, 0, 0]}>
        {labels.loop}
      </Text>
    </group>
  );
}

export function Driver({ floor, view }: { floor: ProtoFloor; view: View }) {
  const look = useRef(new Vector3());
  useFrame(({ camera, size }, rawDt) => {
    const dt = Math.min(rawDt, 0.25);
    const s = sim;
    const move = moveVectorFromKeys(s.keys);
    const manual = move.x || move.y ? cameraRelative(move, s.cameraForward) : null;
    if (manual && s.leg) {
      s.leg.resolve("cancelled");
      s.leg = null;
    }
    const result = s.controller.step(dt, manual, {
      tuning: { maxSpeed: ROVER.maxSpeedFine, accel: ROVER.accel, braking: ROVER.braking, turnRate: ROVER.turnRate, radius: ROVER.radius, maxTilt: ROVER.maxTilt },
      autopilotSpeed: ROVER.autopilotSpeed,
      world: floor,
    });
    if (s.leg && (result.arrived || result.blocked || !s.controller.following)) {
      s.leg.resolve(result.blocked ? "cancelled" : "done");
      s.leg = null;
    }

    const p = s.controller.pose;
    if (view === "top") {
      const b = floor.bounds;
      const w = b.maxX - b.minX;
      const d = b.maxZ - b.minZ;
      const aspect = size.width / Math.max(1, size.height);
      // Portrait screens show the long axis vertically.
      const rotate = aspect < 1 && w > d;
      const vertical = (rotate ? w : d) * 1.08;
      const horizontal = (rotate ? d : w) * 1.08;
      const fov = (40 * Math.PI) / 180;
      const h = Math.max(vertical, horizontal / aspect) / 2 / Math.tan(fov / 2);
      camera.up.set(rotate ? 1 : 0, 0, rotate ? 0 : -1);
      camera.position.set((b.minX + b.maxX) / 2, h, (b.minZ + b.maxZ) / 2 + 0.001);
      camera.lookAt((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    } else {
      camera.up.set(0, 1, 0);
      const target = new Vector3(p.x - 6, 21, p.z + 27);
      camera.position.lerp(target, 1 - Math.exp(-dt * 4));
      look.current.lerp(new Vector3(p.x + 5, 0, p.z - 3), 1 - Math.exp(-dt * 6));
      camera.lookAt(look.current);
    }
    const f = new Vector3();
    camera.getWorldDirection(f);
    if (Math.hypot(f.x, f.z) > 0.05) s.cameraForward = { x: f.x, z: f.z };
    else s.cameraForward = { x: 0, z: -1 };
  });
  return null;
}

/** Marks the prototype ready once a few frames have rendered (screenshot scripts wait for it). */
function Ready() {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 30) document.querySelector("[data-testid='floors-prototype']")?.setAttribute("data-ready", "");
  });
  return null;
}

function World({
  floor,
  career,
  labs,
  data,
  tier,
  view,
  onGoto,
  onRoom,
  labels,
  titles,
}: {
  titles: Map<string, { title: string; sub?: string }>;
  floor: ProtoFloor;
  career: CareerRoadLayout;
  labs: LabsLayout;
  data: ExperienceData;
  tier: GpuTier;
  view: View;
  onGoto: (p: Vec2) => void;
  onRoom: (room: RoomId) => void;
  labels: { rooms: (n: number) => string; workshop: string; more: string; loop: string };
}) {
  const b = floor.bounds;
  return (
    <>
      <color attach="background" args={["#05050c"]} />
      <hemisphereLight args={["#c7d2fe", "#05050c", 0.9]} />
      <directionalLight position={[20, 40, 10]} intensity={0.8} />
      <mesh
        position={[(b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => onGoto({ x: e.point.x, z: e.point.z })}
      >
        <planeGeometry args={[b.maxX - b.minX, b.maxZ - b.minZ]} />
        <meshBasicMaterial color="#0a0a12" />
      </mesh>
      <GridFloor width={b.maxX - b.minX} depth={b.maxZ - b.minZ} center={[(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]} />
      <RoadMarkings network={floor.network} color={floor.accent} tier={tier} reducedMotion={false} />
      {floor.id === "L2" ? (
        <CareerDecor road={career} labels={labels} titles={titles} onRoom={onRoom} tier={tier} />
      ) : (
        <LabsDecor labs={labs} wings={data.labs.wings} labels={labels} onRoom={onRoom} />
      )}
      {/* Elevator shaft. */}
      <mesh position={[floor.approach.x - 7, 3, 0]}>
        <boxGeometry args={[6, 6, 6]} />
        <meshStandardMaterial color="#111827" emissive={floor.accent} emissiveIntensity={0.15} transparent opacity={0.7} />
      </mesh>
      <RoverMesh />
      <Driver floor={floor} view={view} />
      <Ready />
    </>
  );
}

/* --------------------------------------------------------------------- UI */

const seg = (on: boolean) =>
  `inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold transition ${on ? "bg-amber text-void" : "border border-glass-border text-ink-2 hover:text-ink"}`;

/** Dev-only playable prototype of the walkable L2 and L3 floors (design check before the rebuild). */
export default function FloorsPrototype({ data }: { data: ExperienceData }) {
  const tp = useTranslations("proto");
  const tc = useTranslations("hud.career");
  const [initial] = useState(readParams);
  const [floorId, setFloorId] = useState<"L2" | "L3">(initial.floor);
  const [style, setStyle] = useState<RoadStyle>(initial.road);
  const [view, setView] = useState<View>(initial.view);
  const [sheet, setSheet] = useState(initial.sheet);
  const tt = useTranslations("common.type");
  const [card, setCard] = useState<{ title: string; sub?: string } | null>(null);
  const [viewport, setViewport] = useState({ w: 1440, h: 900 });

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const career = useMemo(() => buildCareerRoad(careerLayoutInput(data.career), style), [data.career, style]);
  const labs = useMemo(() => buildLabsLayout(data.labs.pods), [data.labs.pods]);
  const floor: ProtoFloor = useMemo(
    () =>
      floorId === "L2"
        ? { id: "L2", bounds: career.bounds, network: recolor(career), obstacles: career.obstacles, doors: career.doors, approach: career.approach, accent: FLOOR_COLOR.L2 }
        : { id: "L3", bounds: labs.floor.bounds, network: labs.network, obstacles: labs.floor.obstacles, doors: labs.floor.doors ?? [], approach: labs.floor.approach, accent: FLOOR_COLOR.L3 },
    [floorId, career, labs],
  );
  const grid = useMemo(() => buildNavGrid(floor, ROVER.radius), [floor]);
  const graph = useMemo(() => buildRoadGraph(floor.network), [floor]);
  const violations = useMemo(() => spaceViolations({ ...floor, start: floor.approach }), [floor]);

  useEffect(() => resetRover(initial.at ?? floor.approach), [floor, initial.at]);

  // Keyboard driving (WASD and arrows).
  useEffect(() => {
    const keys = sim.keys;
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
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

  const doorOf = useCallback((room: RoomId) => floor.doors.find((d) => d.room === room)?.at ?? null, [floor]);
  const titles = useMemo(() => {
    const map = new Map<string, { title: string; sub?: string }>();
    for (const y of data.career.years) for (const e of y.entries) map.set(`L2:${e.slug}`, { title: e.role, sub: `${e.org} · ${e.period}` });
    map.set("L2:workshop", { title: tc("workshop") });
    for (const p of data.labs.pods) map.set(`L3:${p.slug}`, { title: p.title, sub: data.labs.wings[p.wing] });
    return map;
  }, [data, tc]);

  const drive = useCallback(
    (to: Vec2, road: boolean) => startLeg(road ? roadRoute(floor.network, grid, sim.controller.pose, to, graph) : findPath(grid, sim.controller.pose, to)),
    [floor, grid, graph],
  );

  const compact = viewport.w < 640;
  const b = floor.bounds;
  const roomCount = floor.doors.length;

  const typeCounts = Object.fromEntries(TYPES.map((type) => [type, career.rooms.filter((r) => r.type === type).length])) as Record<CareerType, number>;
  const panelBody = (
    <>
    <p className="eyebrow text-amber">{tp("title")}</p>
    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={tp("floor")}>
      {(["L2", "L3"] as const).map((id) => (
        <button key={id} type="button" className={seg(floorId === id)} aria-pressed={floorId === id} onClick={() => setFloorId(id)}>
          {tp(id)}
        </button>
      ))}
    </div>
    {floorId === "L2" && (
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={tp("road")}>
        {(["straight", "meander"] as const).map((r) => (
          <button key={r} type="button" className={seg(style === r)} aria-pressed={style === r} onClick={() => setStyle(r)}>
            {tp(r)}
          </button>
        ))}
      </div>
    )}
    <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={tp("view")}>
      {(["rover", "top"] as const).map((v) => (
        <button key={v} type="button" className={seg(view === v)} aria-pressed={view === v} onClick={() => setView(v)}>
          {tp(v)}
        </button>
      ))}
    </div>
    <p className="label mt-2 text-ink-3">
      {tp("size", { w: Math.round(b.maxX - b.minX), d: Math.round(b.maxZ - b.minZ), rooms: roomCount, plazas: floor.network.plazas.length })}
    </p>
    <p className="label text-ink-3" data-testid="proto-rules">
      {tp("rules")}: <span className={violations.length ? "text-pink" : "text-green"}>{violations.length ? tp("violations", { count: violations.length }) : tp("pass")}</span>
    </p>
    <p className="mt-1 hidden text-xs text-ink-3 md:block">{tp("hint")}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button type="button" className={seg(sheet)} aria-pressed={sheet} onClick={() => setSheet((x) => !x)}>
          {tp("sheet")}
        </button>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-void text-ink" data-testid="floors-prototype" data-floor={floorId} data-road={style} data-view={view}>
      <Canvas
        dpr={initial.tier === "full" ? [1, 2] : [1, 1.5]}
        gl={{ antialias: true }}
        camera={{ fov: 40, near: 0.5, far: 2000, position: [0, 60, 60] }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
        }}
      >
        <World
          floor={floor}
          career={career}
          labs={labs}
          data={data}
          tier={initial.tier}
          view={view}
          onGoto={(p) => void drive(p, false)}
          onRoom={(room) => {
            const at = doorOf(room);
            if (at) void drive(at, true).then((s) => s === "done" && setCard(titles.get(room) ?? { title: room }));
          }}
          labels={{ rooms: (n) => tp("rooms", { count: n }), workshop: tc("workshop"), more: tp("more"), loop: tp("loop") }}
          titles={titles}
        />
      </Canvas>

      {compact ? (
        <details className="glass glass-solid pointer-events-auto absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] p-2 text-sm" data-testid="proto-panel">
          <summary className="label min-h-11 cursor-pointer content-center px-2 text-amber">{tp("title")}</summary>
          <div className="p-1">{panelBody}</div>
        </details>
      ) : (
        <section className="glass glass-solid pointer-events-auto absolute top-3 left-3 w-[min(340px,calc(100%-1.5rem))] p-3 text-sm" data-testid="proto-panel">
          {panelBody}
        </section>
      )}

      {sheet && (
        <section className="glass glass-solid pointer-events-auto absolute top-1/2 left-1/2 w-[min(640px,calc(100%-1.5rem))] -translate-x-1/2 -translate-y-1/2 p-5" data-testid="proto-sheet">
          <p className="eyebrow text-amber">{tp("sheetTitle")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TYPES.map((type) => (
              <span key={type} className="chip" style={{ borderColor: `${CAREER_TONE[type]}66` }}>
                <TypeIcon type={type} />
                <span className="text-ink">{tt(type)}</span>
                <span className="chip-count">{typeCounts[type]}</span>
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            {TYPES.map((type) => (
              <TypeIcon key={type} type={type} size={44} title={tt(type)} />
            ))}
          </div>
          <button type="button" className="link mt-3 min-h-11 text-sm" onClick={() => setSheet(false)}>
            {tp("close")}
          </button>
        </section>
      )}

      {card && (
        <section className={`glass glass-solid pointer-events-auto absolute right-3 w-[min(320px,calc(100%-1.5rem))] p-4 ${compact ? "bottom-[72px]" : "top-3"}`} data-testid="proto-card">
          <p className="text-base font-semibold text-ink">{card.title}</p>
          {card.sub && <p className="text-sm text-ink-2">{card.sub}</p>}
          <button type="button" className="link mt-2 min-h-11 text-sm" onClick={() => setCard(null)}>
            {tp("close")}
          </button>
        </section>
      )}
    </div>
  );
}
