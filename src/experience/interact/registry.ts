import type { FloorId, RoomId, Wing } from "@/content/schema";
import type { ReactorRingId } from "@/content/tech-rings";
import { LOBBY } from "../config";
import { repoRoom, sideProjectRoom, WORKSHOP_ROOM } from "@/content/workshop";
import { buildCareerRoad, careerLayoutInput, type CareerRoadLayout } from "../floors/career/layout";
import { SKYLINE } from "../floors/career/skyline";
import { WORKSHOP } from "../floors/career/workshopLayout";
import { buildLabsLayout, LABS, LABS_WINGS, type LabsLayout } from "../floors/labs/layout";
import { OPS } from "../floors/labs/ops";
import { OPS_ROOM } from "../floors/labs/opsHash";
import { REACTOR } from "../floors/labs/reactor";
import { REACTOR_ROOM, reactorStop, ringBands, ringById } from "../floors/labs/techReactor";
import { kioskStop } from "../floors/lobby/kiosk";
import { NEWSROOM } from "../floors/library/concepts/newsroom";
import { buildLibraryLayout } from "../floors/library/layout";
import { libraryLayoutInput, type LibraryLayout, type LibraryZone } from "../floors/library/model";
import { TOPICS_ROOM } from "../floors/library/topicHash";
import { CONSTELLATION } from "../floors/library/topics";
import { buildRoofLayout, ROOF_DECK } from "../floors/roof/layout";
import { roomTarget } from "../missions/host3d";
import type { StructuralRoom } from "../missions/rooms";
import { padHalf } from "../nav/doors";
import { PAD, padRadius } from "../nav/pads";
import type { DoorTrigger, ExperienceData, FloorLayouts, PadTrigger, Rect, Vec2 } from "../types";

/**
 * Point-and-go targets (owner request): everything the visitor can hover and click to drive the rover
 * there. Derived from the floor layouts and the locale-resolved ExperienceData, so the scene, the HUD,
 * the autopilot and the tests agree. Pure: no React, no three.
 */
export type InteractKind = "door" | "elevator-pad" | "return-pad" | "teleporter" | "station" | "kiosk" | "board";

export type InteractAction =
  | { type: "open-room"; room: RoomId }
  | { type: "elevator-picker" }
  | { type: "teleport-picker"; year: number }
  /** Express Return pad (fast return): beam to the floor's elevator call pad. */
  | { type: "return-beam" }
  /** L2 time console: every year plaza plus Back to elevator. */
  | { type: "console-picker" }
  | { type: "command"; command: string };

export interface Interactable {
  /** Stable: `${floor}:${short kind}:${key}`, e.g. "L3:door:voice-ai-contact-center", "L1:pad:elevator", "L2:pad:return", "L2:teleporter:2021". */
  id: string;
  floor: FloorId;
  kind: InteractKind;
  /** Name shown on hover, already resolved for the tower's locale (the 3D chunk only has that locale). */
  label: string;
  /** Approach point the rover drives to (door pad center, pad center, the stop in front of a board or station). */
  at: Vec2;
  /** Hover and click footprint, floor-local x/z. */
  bounds: Rect;
  /** Pick volume height (u), the top of the volume; also places the floating label. Defaults per kind (`PICK_HEIGHT` in pick.ts). */
  height?: number;
  /** Bottom of the pick volume (u above the floor, default 0): stacked targets such as the Tech Reactor rings. */
  base?: number;
  action: InteractAction;
}

/** UI labels for targets without a content title (`hud.pads.floorTitle`, `hud.interact.*`, `hud.launcher.askRover`, `hud.rooms`). */
export interface InteractLabels {
  elevator: string;
  /** Express Return pads: "Back to elevator" (`hud.interact.returnPad`). */
  returnPad: string;
  teleporter: (year: number) => string;
  /** L2 time console (`hud.interact.console`). */
  console: string;
  kiosk: string;
  board: (wing: string) => string;
  archive: string;
  rooms: Record<StructuralRoom, string>;
  /** L3 Tech Reactor ring targets ("Tech Reactor: Azure"). */
  reactorRing: (ring: ReactorRingId) => string;
  /** L4 research-metrics monument (`library.topics.monument.target`). */
  metrics: string;
}

export interface InteractData {
  experience: ExperienceData;
  labels: InteractLabels;
}

const WINGS: readonly Wing[] = LABS_WINGS;
/** Pads: the floating icon tops out here. */
const PAD_HEIGHT = PAD.iconY + PAD.iconSize / 2;
/** L2 rooms are open bays with a neon frame about 2.2 u tall. */
const CAREER_ROOM_HEIGHT = 2.4;
/** L4 stations (blog plinths are low, so their volume reaches their billboard titles). */
const STATION_HEIGHT: Record<LibraryZone, number> = { blog: 2, research: 3.2, models: 2.6, talks: 2.6 };
const KIOSK_HEIGHT = 3.4;
/** L2 Workshop: bench card tops and the console screen top (`WorkshopAnnex`). */
export const BENCH_TOP = 3.1;
export const CONSOLE_TOP = 2.9;
const PROFILE_HEIGHT = 7;
/** Door items without a known room footprint keep a plain door-pad volume this tall. */
const DOOR_HEIGHT = 2.6;

/** Rooms with a UI label instead of a content title. */
const STRUCTURAL: Partial<Record<RoomId, StructuralRoom>> = {
  "L1:profile": "profile",
  "L1:skills": "skills",
  [WORKSHOP_ROOM]: "workshop",
  "L4:research": "research",
  "L4:publications": "publications",
  "L4:talks": "talks",
  "RF:contact": "contact",
  "RF:cv": "cv",
  [REACTOR_ROOM]: "reactor",
  [TOPICS_ROOM]: "topics",
  "RF:visits": "visits",
  [OPS_ROOM]: "ops",
};

type Footprint = { rect: Rect; height: number };

const rectAround = (c: Vec2, w: number, d: number): Rect => ({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - d / 2, maxZ: c.z + d / 2 });
const bare = ({ minX, maxX, minZ, maxZ }: Rect): Rect => ({ minX, maxX, minZ, maxZ });
const union = (a: Rect, b: Rect): Rect => ({
  minX: Math.min(a.minX, b.minX),
  maxX: Math.max(a.maxX, b.maxX),
  minZ: Math.min(a.minZ, b.minZ),
  maxZ: Math.max(a.maxZ, b.maxZ),
});

/** A door's trigger pad as an axis-aligned rect (doors face along x or z). */
function doorRect(door: DoorTrigger): Rect {
  const { along, across } = padHalf(door);
  const f = door.facing ?? { x: 0, z: 1 };
  const hx = Math.abs(f.x) * along + Math.abs(f.z) * across;
  const hz = Math.abs(f.z) * along + Math.abs(f.x) * across;
  return { minX: door.at.x - hx, maxX: door.at.x + hx, minZ: door.at.z - hz, maxZ: door.at.z + hz };
}

function roomLabel(room: RoomId, data: InteractData): string {
  const structural = STRUCTURAL[room];
  if (structural) return data.labels.rooms[structural];
  const slug = room.slice(3);
  const { experience } = data;
  if (room.startsWith("L2:")) {
    const entry = experience.career.years.flatMap((y) => y.entries).find((e) => e.slug === slug);
    if (entry) return entry.org ? `${entry.role} · ${entry.org}` : entry.role;
  }
  if (room.startsWith("L3:")) {
    const pod = experience.labs.pods.find((p) => p.slug === slug);
    if (pod) return pod.title;
  }
  if (room.startsWith("L4:")) {
    const post = experience.library.posts.find((p) => p.slug === slug);
    if (post) return post.title;
  }
  return slug;
}

function padItem(floor: FloorId, pad: PadTrigger, labels: InteractLabels): Interactable {
  const r = padRadius(pad);
  const bounds = rectAround(pad.at, r * 2, r * 2);
  const at = { x: pad.at.x, z: pad.at.z };
  if (pad.kind === "teleport" && pad.year !== undefined) {
    return { id: `${floor}:teleporter:${pad.year}`, floor, kind: "teleporter", label: labels.teleporter(pad.year), at, bounds, height: PAD_HEIGHT, action: { type: "teleport-picker", year: pad.year } };
  }
  if (pad.kind === "return") {
    return { id: `${floor}:pad:return`, floor, kind: "return-pad", label: labels.returnPad, at, bounds, height: PAD_HEIGHT, action: { type: "return-beam" } };
  }
  return { id: `${floor}:pad:elevator`, floor, kind: "elevator-pad", label: labels.elevator, at, bounds, height: PAD_HEIGHT, action: { type: "elevator-picker" } };
}

/** Every door of the floor; RF doors are stations (comms, CV), the rest are room doors. */
function doorItems(floor: FloorId, layouts: FloorLayouts, data: InteractData, rooms: ReadonlyMap<RoomId, Footprint>): Interactable[] {
  const kind = floor === "RF" ? "station" : "door";
  return (layouts[floor].doors ?? []).map((door) => {
    const pad = doorRect(door);
    const room = rooms.get(door.room);
    const at = roomTarget(undefined, door.room, layouts, data.experience.years);
    return {
      id: `${floor}:${kind}:${door.room.slice(3)}`,
      floor,
      kind,
      label: roomLabel(door.room, data),
      at: { x: at.x, z: at.z },
      bounds: room ? union(room.rect, pad) : pad,
      height: room?.height ?? DOOR_HEIGHT,
      action: { type: "open-room", room: door.room },
    };
  });
}

function lobbyItems(layouts: FloorLayouts, data: InteractData): Interactable[] {
  const { hologram, skillsWall, kiosk } = LOBBY;
  const stop = (room: RoomId) => {
    const at = roomTarget(undefined, room, layouts, data.experience.years);
    return { x: at.x, z: at.z };
  };
  return [
    {
      id: "L1:station:profile",
      floor: "L1",
      kind: "station",
      label: data.labels.rooms.profile,
      at: stop("L1:profile"),
      bounds: rectAround(hologram, hologram.radius * 2, hologram.radius * 2),
      height: PROFILE_HEIGHT,
      action: { type: "open-room", room: "L1:profile" },
    },
    {
      id: "L1:station:skills",
      floor: "L1",
      kind: "station",
      label: data.labels.rooms.skills,
      at: stop("L1:skills"),
      bounds: rectAround(skillsWall, skillsWall.w, skillsWall.d),
      height: skillsWall.h + skillsWall.plinth,
      action: { type: "open-room", room: "L1:skills" },
    },
    {
      id: "L1:kiosk:ask-rover",
      floor: "L1",
      kind: "kiosk",
      label: data.labels.kiosk,
      // Centered in front of the screen (floors/lobby/kiosk.ts), so the rover stops facing it.
      at: kioskStop(),
      bounds: rectAround(kiosk, kiosk.w, kiosk.d),
      height: KIOSK_HEIGHT,
      action: { type: "command", command: "terminal" },
    },
  ];
}

function labsBoards(labs: LabsLayout, data: InteractData): Interactable[] {
  return WINGS.flatMap((wing) => {
    const board = labs.boards[wing];
    if (!board) return [];
    return {
      id: `L3:board:${wing}`,
      floor: "L3",
      kind: "board",
      label: data.labels.board(data.experience.labs.wings[wing]),
      at: { x: board.stop.x, z: board.stop.z },
      bounds: bare(board),
      height: LABS.board.h,
      action: { type: "command", command: "palette:pods" },
    };
  });
}

/**
 * The Tech Reactor rings (design 2026-10-14): one stacked band of the core per ring, from the floor up to
 * the top ring, each wide enough to cover its ring. The rover drives to the reactor stop, then the drawer
 * opens on that ring (`reactor:<ring>` command).
 */
function reactorRings(labs: LabsLayout, data: InteractData): Interactable[] {
  const center = labs.reactor.center;
  const at = reactorStop(center);
  return ringBands().map(({ id, base, top }) => {
    const r = Math.max(REACTOR.half, ringById(id).r);
    return {
      id: `L3:station:reactor-${id}`,
      floor: "L3",
      kind: "station",
      label: data.labels.reactorRing(id),
      at: { x: at.x, z: at.z },
      bounds: rectAround(center, r * 2, r * 2),
      base,
      height: top,
      action: { type: "command", command: `reactor:${id}` },
    } satisfies Interactable;
  });
}

/**
 * The L4 end plaza (owner request 2026-10-14): the Topic Constellation pedestal (drive to the ring stop,
 * then the topic drawer opens) and the research-metrics monument (drive in front of it, then the Research
 * desk drawer opens in place). The orbiting topic orbs keep their own clicks (they pick a topic, no drive).
 */
function endItems(library: LibraryLayout, data: InteractData): Interactable[] {
  const end = library.end;
  if (!end) return [];
  return [
    {
      id: "L4:station:topics",
      floor: "L4",
      kind: "station",
      label: data.labels.rooms.topics,
      at: { ...end.ringStop },
      bounds: bare(end.core),
      height: CONSTELLATION.pedestal,
      action: { type: "open-room", room: TOPICS_ROOM },
    },
    ...(end.monument
      ? [
          {
            id: "L4:station:metrics",
            floor: "L4",
            kind: "station",
            label: data.labels.metrics,
            at: { ...end.monument.stop },
            bounds: bare(end.monument.rect),
            height: NEWSROOM.end.monument.h,
            action: { type: "command", command: "open:L4:research" },
          } satisfies Interactable,
        ]
      : []),
  ];
}

function archiveBoard(library: LibraryLayout, data: InteractData): Interactable[] {
  if (!library.board) return [];
  return [
    {
      id: "L4:board:archive",
      floor: "L4",
      kind: "board",
      label: data.labels.archive,
      at: { x: library.board.stop.x, z: library.board.stop.z },
      bounds: bare(library.board.rect),
      height: NEWSROOM.board.h,
      action: { type: "command", command: "palette:posts" },
    },
  ];
}

/**
 * L2 Workshop (F3): the gateway (Workshop overview), the time console (year picker), one target per
 * bench (its side project drawer) and per skyline bar (its repo drawer). Stops come from the layout.
 */
function workshopItems(road: CareerRoadLayout, data: InteractData): Interactable[] {
  const w = road.workshop;
  const projects = new Map(data.experience.career.sideProjects.map((p) => [p.id, p.title]));
  const gate = union(w.gateway.rects[0], w.gateway.rects[1]);
  const half = SKYLINE.bar / 2;
  return [
    {
      id: "L2:station:workshop",
      floor: "L2",
      kind: "station",
      label: data.labels.rooms.workshop,
      at: { ...w.gateway.stop },
      bounds: gate,
      height: WORKSHOP.gateway.height + WORKSHOP.gateway.beam,
      action: { type: "open-room", room: WORKSHOP_ROOM },
    },
    {
      id: "L2:station:time-console",
      floor: "L2",
      kind: "station",
      label: data.labels.console,
      at: { ...w.console.stop },
      bounds: bare(w.console.rect),
      height: CONSOLE_TOP,
      action: { type: "console-picker" },
    },
    ...w.benches.map(
      (b): Interactable => ({
        id: `L2:station:bench-${b.id}`,
        floor: "L2",
        kind: "station",
        label: projects.get(b.id) ?? b.id,
        at: { ...b.stop },
        bounds: bare(b.rect),
        height: BENCH_TOP,
        action: { type: "open-room", room: sideProjectRoom(b.id) },
      }),
    ),
    ...w.skyline.bars.map(
      (bar, i): Interactable => ({
        id: `L2:station:repo-${bar.slug}`,
        floor: "L2",
        kind: "station",
        label: bar.name,
        at: { ...w.skyline.stops[i] },
        bounds: { minX: bar.x - half, maxX: bar.x + half, minZ: bar.z - half, maxZ: bar.z + half },
        height: bar.h + SKYLINE.plinth,
        action: { type: "open-room", room: repoRoom(bar.slug) },
      }),
    ),
  ];
}

/** Built-in targets of one floor, in order: pads, doors and stations, then floor extras (L1 kiosk, boards). */
export function baseInteractables(floor: FloorId, layouts: FloorLayouts, data: InteractData): Interactable[] {
  const pads = (layouts[floor].pads ?? []).map((pad) => padItem(floor, pad, data.labels));
  const { experience } = data;
  switch (floor) {
    case "L1":
      return [...pads, ...lobbyItems(layouts, data)];
    case "L2": {
      const road = buildCareerRoad(careerLayoutInput(experience.career));
      const rooms = new Map<RoomId, Footprint>(road.rooms.map((r) => [r.id, { rect: rectAround(r.center, r.w, r.d), height: CAREER_ROOM_HEIGHT }]));
      return [...pads, ...doorItems(floor, layouts, data, rooms), ...workshopItems(road, data)];
    }
    case "L3": {
      const labs = buildLabsLayout(experience.labs.pods);
      const rooms = new Map<RoomId, Footprint>([
        ...labs.placed.map((p): [RoomId, Footprint] => [p.room, { rect: bare(p.rect), height: LABS.wallHeight }]),
        [OPS_ROOM, { rect: bare(labs.ops.rect), height: OPS.h }],
      ]);
      return [...pads, ...doorItems(floor, layouts, data, rooms), ...labsBoards(labs, data), ...reactorRings(labs, data)];
    }
    case "L4": {
      const library = buildLibraryLayout(libraryLayoutInput(experience.library));
      const rooms = new Map<RoomId, Footprint>(library.stations.map((s) => [s.room, { rect: bare(s.rect), height: STATION_HEIGHT[s.zone] }]));
      return [...pads, ...doorItems(floor, layouts, data, rooms), ...endItems(library, data), ...archiveBoard(library, data)];
    }
    case "RF": {
      const roof = buildRoofLayout({ channels: experience.roof.channels.length });
      const rooms = new Map<RoomId, Footprint>([
        ["RF:contact", { rect: bare(roof.comms), height: 4 }],
        ["RF:cv", { rect: bare(roof.cv), height: 3.6 }],
        ["RF:visits", { rect: bare(roof.visits), height: ROOF_DECK.visitsHeight }],
      ]);
      return [...pads, ...doorItems(floor, layouts, data, rooms)];
    }
  }
}

const extras = new Map<FloorId, Set<readonly Interactable[]>>();
const snapshots = new Map<FloorId, readonly Interactable[]>();
const listeners = new Set<() => void>();

function changed() {
  snapshots.clear();
  listeners.forEach((listener) => listener());
}

/** Adds targets to a floor (for example the L1 Highlights Hall); returns the dispose function. */
export function registerExtraInteractables(floor: FloorId, items: readonly Interactable[]): () => void {
  const stray = items.find((item) => item.floor !== floor);
  if (stray) throw new Error(`Interactable ${stray.id} belongs to ${stray.floor}, not ${floor}`);
  const set = extras.get(floor) ?? new Set<readonly Interactable[]>();
  extras.set(floor, set);
  set.add(items);
  changed();
  return () => {
    if (set.delete(items)) changed();
  };
}

/** Registered extras of a floor; the same array instance until the extras change (safe for useSyncExternalStore). */
export function extraInteractables(floor: FloorId): readonly Interactable[] {
  let list = snapshots.get(floor);
  if (!list) {
    list = [...(extras.get(floor) ?? [])].flat();
    snapshots.set(floor, list);
  }
  return list;
}

/** Called whenever extras are registered or disposed. */
export function onInteractablesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function mergeInteractables(base: readonly Interactable[], more: readonly Interactable[]): Interactable[] {
  const ids = new Set(base.map((item) => item.id));
  return [...base, ...more.filter((item) => !ids.has(item.id))];
}

/** Built-in targets plus registered extras for that floor (an extra whose id already exists is dropped). */
export function interactablesFor(floor: FloorId, layouts: FloorLayouts, data: InteractData): Interactable[] {
  return mergeInteractables(baseInteractables(floor, layouts, data), extraInteractables(floor));
}
