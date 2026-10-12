import type { FloorId, MissionStep, RoomId } from "@/content/schema";
import { floorOf } from "./missions/rooms";

/**
 * Where the rover goes once the first intro of a session ends on a deep link (owner decision: the
 * boot and the intro play on every first 3D load, then the rover continues to the linked floor or
 * room through the mission runner, so manual input can still take over). Pure, plus one pending slot.
 */
export interface IntroTarget {
  floor: FloorId;
  room?: RoomId;
  /** `?view=architecture`: open the room's hologram once the drawer is open. */
  architecture?: boolean;
}

export interface IntroTargetInput {
  /** Floor of a language switch (`hq:resume`), which wins over the route's floor. */
  resumeFloor?: FloorId;
  startFloor?: FloorId;
  startRoom?: RoomId;
  ready: readonly FloorId[];
  architecture?: boolean;
}

/** The deep-linked room (on a ready floor) or the deep-linked floor above the Lobby; null for the Lobby. */
export function introTarget({ resumeFloor, startFloor, startRoom, ready, architecture = false }: IntroTargetInput): IntroTarget | null {
  if (startRoom) {
    const floor = floorOf(startRoom);
    return ready.includes(floor) ? { floor, room: startRoom, architecture } : null;
  }
  const floor = resumeFloor ?? startFloor;
  return floor && floor !== "L1" && ready.includes(floor) ? { floor } : null;
}

/** Mission steps that carry the rover from the Lobby to the target: ride, then drive and open a room. */
export function continuationSteps(target: IntroTarget): MissionStep[] {
  const ride: MissionStep = { kind: "elevator", floor: target.floor };
  return target.room ? [ride, { kind: "drive", to: target.room }, { kind: "open", room: target.room }] : [ride];
}

let pending: IntroTarget | null = null;
let continuing = false;

/** Remembers where to continue once the intro ends (null clears it). */
export function setIntroTarget(target: IntroTarget | null) {
  pending = target;
}

/** Hands the pending target over once; while its continuation runs, `isContinuing()` is true. */
export function takeIntroTarget(): IntroTarget | null {
  const target = pending;
  pending = null;
  if (target) continuing = true;
  return target;
}

export function endContinuation() {
  continuing = false;
}

/** A deep link is pending or being continued (the Lobby-only first-visit terminal stays closed). */
export function isContinuing(): boolean {
  return continuing || pending !== null;
}
