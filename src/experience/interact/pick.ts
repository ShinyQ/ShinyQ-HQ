import type { MissionStep, RoomId } from "@/content/schema";
import { REACTOR_RINGS, type ReactorRingId } from "@/content/tech-rings";
import { DRAG_THRESHOLD } from "../input/intents";
import type { MissionStatus, PaletteFilter } from "../missions/host";
import { PAD, type PickerRequest } from "../nav/pads";
import type { Vec2 } from "../types";
import type { InteractKind, Interactable } from "./registry";

/**
 * Point-and-go pick logic: pick volumes, click versus tap, the highlight pulse and what a target does
 * once the rover gets there. Pure: no React, no three, no store (the Director injects `InteractDeps`).
 */

/** Height (u) of a pick volume when the registry entry gives none. */
export const PICK_HEIGHT: Record<InteractKind, number> = { door: 2.6, "elevator-pad": 2.9, "return-pad": 2.9, teleporter: 2.9, station: 4, kiosk: 3.4, board: 7 };
/**
 * The floating name tag stands over the destination ring (the approach point), this high above the floor:
 * in-world titles sit over the objects themselves, so the tag never doubles or covers them. Pads lift it
 * over their floating icon.
 */
export const LABEL_HEIGHT = 1.6;
export const LABEL_PAD_HEIGHT = PAD.iconY + PAD.iconSize / 2 + 0.4;
/** The rover counts as already there inside this radius: the whole pad for pickers, a short radius elsewhere. */
export const REACH = { pad: PAD.radius, point: 0.8 } as const;

export interface PickVolume {
  center: [number, number, number];
  size: [number, number, number];
}

/** The box the pointer hits: the footprint from `base` (the floor by default) up to `height`. */
export function pickVolume(item: Pick<Interactable, "bounds" | "height" | "kind" | "base">): PickVolume {
  const top = item.height ?? PICK_HEIGHT[item.kind];
  const base = Math.min(item.base ?? 0, top);
  const { minX, maxX, minZ, maxZ } = item.bounds;
  return { center: [(minX + maxX) / 2, (base + top) / 2, (minZ + maxZ) / 2], size: [maxX - minX, top - base, maxZ - minZ] };
}

/** Where the floating name tag stands (floor-local): over the approach point, where the rover will stop. */
export function labelAnchor(item: Pick<Interactable, "at" | "kind">): [number, number, number] {
  const pad = item.kind === "elevator-pad" || item.kind === "return-pad" || item.kind === "teleporter";
  return [item.at.x, pad ? LABEL_PAD_HEIGHT : LABEL_HEIGHT, item.at.z];
}

/** A press that travelled past the drag threshold rotated the view; it is not a click or a tap. */
export function isDragClick(delta: number, pointerType: string): boolean {
  const limit = DRAG_THRESHOLD[pointerType as keyof typeof DRAG_THRESHOLD] ?? DRAG_THRESHOLD.mouse;
  return delta > limit;
}

export interface PointState {
  phase: string;
  ride: unknown;
  beam: unknown;
  picker: unknown;
}

/** Pointing works while exploring or with a room open, never during a ride, a beam, a picker or another overlay. */
export function canPoint(s: PointState): boolean {
  return (s.phase === "explore" || s.phase === "room") && !s.ride && !s.beam && !s.picker;
}

export type HoverVia = "pointer" | "tap";

/** The target under the mouse (`pointer`) or picked by a first tap (`tap`). */
export interface HoverState {
  item: Interactable;
  via: HoverVia;
}

/** Mouse and pen go at once; touch selects first and goes on a second tap of the same target. */
export function clickDecision(hover: HoverState | null, item: Interactable, pointerType: string): "go" | "select" {
  if (pointerType !== "touch") return "go";
  return hover?.via === "tap" && hover.item.id === item.id ? "go" : "select";
}

/** Highlight opacity: a gentle pulse, constant under reduced motion. */
export function highlightOpacity(t: number, reducedMotion: boolean): number {
  return reducedMotion ? 0.9 : 0.65 + 0.25 * Math.sin(t * 4);
}

export type InteractCommand =
  | { type: "terminal" }
  | { type: "palette"; filter: PaletteFilter }
  | { type: "cv" }
  | { type: "reactor"; ring: ReactorRingId }
  /** Opens a room's drawer where the rover stands (the L4 research monument opens the Research desk). */
  | { type: "open"; room: RoomId };

const PALETTE_FILTERS: readonly PaletteFilter[] = ["pods", "rooms", "posts"];

const OPEN_ROOM = /^open:((?:L1|L2|L3|L4|RF):[a-z0-9-]+)$/;

/**
 * `"terminal"`, `"cv"`, `"palette:<pods|rooms|posts>"`, `"reactor:<ring>"` (Tech Reactor drawer on a ring)
 * or `"open:<room id>"` (that room's drawer in place); anything else is null.
 */
export function parseCommand(command: string): InteractCommand | null {
  if (command === "terminal") return { type: "terminal" };
  if (command === "cv") return { type: "cv" };
  const open = OPEN_ROOM.exec(command);
  if (open) return { type: "open", room: open[1] as RoomId };
  const [head, filter] = command.split(":");
  if (head === "palette" && PALETTE_FILTERS.includes(filter as PaletteFilter)) return { type: "palette", filter: filter as PaletteFilter };
  if (head === "reactor" && (REACTOR_RINGS as readonly string[]).includes(filter)) return { type: "reactor", ring: filter as ReactorRingId };
  return null;
}

/** What `performInteract` needs from the world (the Director passes the real ones). */
export interface InteractDeps {
  rover: () => Vec2;
  /** Elevator, drive and open through the mission runner (`goToRoom` in missions/bridge.ts). */
  goToRoom: (room: RoomId) => void;
  /** Ad hoc mission steps (`runMissionSteps` in missions/bridge.ts): manual input cancels them. */
  runSteps: (id: string, steps: readonly MissionStep[]) => Promise<MissionStatus>;
  openPicker: (picker: PickerRequest) => void;
  command: (command: InteractCommand) => void;
  /** Express Return pads: beam to the floor's elevator call pad (`elevatorBeam` in nav/fastReturn.ts). */
  beamHome: () => void;
}

export function reach(item: Pick<Interactable, "action">): number {
  const pad = item.action.type === "elevator-picker" || item.action.type === "teleport-picker" || item.action.type === "return-beam";
  return pad ? REACH.pad : REACH.point;
}

/**
 * Drives to the target along the road (a mission leg, so keys and the joystick cancel it), then runs
 * its action. Rooms go through `goToRoom`, which drives to the door pad and opens the drawer.
 */
export async function performInteract(item: Interactable, deps: InteractDeps): Promise<"done" | "cancelled"> {
  const { action } = item;
  if (action.type === "open-room") {
    deps.goToRoom(action.room);
    return "done";
  }
  const here = deps.rover();
  if (Math.hypot(here.x - item.at.x, here.z - item.at.z) > reach(item)) {
    const status = await deps.runSteps(`interact:${item.id}`, [{ kind: "drive", to: { x: item.at.x, z: item.at.z } }]);
    if (status !== "done") return "cancelled";
  }
  if (action.type === "elevator-picker") deps.openPicker({ kind: "floor" });
  else if (action.type === "teleport-picker") deps.openPicker({ kind: "year", from: action.year });
  else if (action.type === "return-beam") deps.beamHome();
  else if (action.type === "console-picker") deps.openPicker({ kind: "console" });
  else {
    const command = parseCommand(action.command);
    if (command) deps.command(command);
  }
  return "done";
}
