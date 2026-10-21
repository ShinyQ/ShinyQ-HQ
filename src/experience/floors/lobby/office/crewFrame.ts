import type { OfficeState } from "@/lib/office/protocol";
import type { Vec2 } from "../../../types";
import type { OfficeSlot } from "../officeLayout";
import { CREW, crewFx, crewTarget, lookYaw, newActor, stepCrew, type CrewActor, type CrewFx, type CrewLook } from "./crew";
import { crewGlowKey, droneKey } from "./crewFx";
import type { RoverWrites } from "./officeFrame";
import type { OfficeRoverView } from "./officeModel";
import { glowKey } from "./officeRig";
import { slotPhase, STILL_T, type OfficePose } from "./officeVisual";

/**
 * The office frame loop's crew step (no GPU work): advances each desk's actor, records its pose and glow key in
 * `RoverWrites` (which marks what changed) and measures the bob probe. OfficeScene writes the meshes from the marks.
 */
export interface OfficeCrew {
  actors: CrewActor[];
  /** Per slot: the turns toward the camera (updated when the camera moves) and the CI tower (fixed). */
  looks: CrewLook[];
  /** Per slot: the actor's effects this frame (written in place). */
  fx: CrewFx[];
}

const NO_LOOK: CrewLook = { camera: 0, tower: 0 };
const HELD: OfficePose = crewTarget("asleep", STILL_T, 0, true, NO_LOOK, 0);

/** Every Rover asleep and docked, looking at `camera` (where the tips were last turned) and the tower column. */
export function officeCrew(slots: readonly OfficeSlot[], camera: Vec2, tower: Vec2): OfficeCrew {
  return {
    actors: slots.map(() => newActor("asleep")),
    looks: slots.map((s) => ({ camera: lookYaw(s, camera, CREW.cameraClamp), tower: lookYaw(s, tower) })),
    fx: slots.map(() => crewFx(newActor("asleep"), true)),
  };
}

/** The docked asleep pose (both motion settings): the rest instances and `RoverWrites`' first record, so a sleeping office writes nothing. */
export const restCrewPose = (): OfficePose => crewTarget("asleep", STILL_T, 0, true, NO_LOOK, 0);

/** A Rover's glow key: the rig's (`glowKey`), the crew's (`crewGlowKey`) and its helper drones' (`droneKey`, absent without drones). */
export function crewKey(state: OfficeState, progress: OfficeRoverView["progress"], fx: CrewFx, now: number, reduced: boolean, drones = 0, lite = false): string {
  const d = droneKey(drones, now, reduced, lite);
  return glowKey(state, progress, reduced, now) + "|" + crewGlowKey(state, fx, now, reduced) + (d ? "|" + d : "");
}

/** The asleep office's glow key under reduced motion (the rest glow). */
export const restCrewKey = (): string => crewKey("asleep", null, crewFx(newActor("asleep"), true), 0, true);

/**
 * Largest body offset (y, pitch, sway, roll) from the pose the state holds under reduced motion (the crew's docked
 * slump and working pitch included): the `bob` probe. The offsets, turn, flag and wave are not body motion; 0 under
 * reduced motion.
 */
export function crewOffset(state: OfficeState, p: OfficePose, phase: number): number {
  const s = crewTarget(state, STILL_T, phase, true, NO_LOOK, 0, HELD);
  return Math.max(Math.abs(p.y - s.y), Math.abs(p.rx - s.rx), Math.abs(p.ry - s.ry), Math.abs(p.rz - s.rz));
}

/**
 * One frame of the crew: turns the camera looks when the camera moved (marking every glow), steps each Rover's actor
 * by `dt` (already clamped and scaled), records its pose and glow key (the helper drones ride on the glow key: their
 * bodies are written with the glow). Returns the bob probe. No allocation but the short key strings.
 */
export function stepOfficeCrew(c: OfficeCrew, writes: RoverWrites, slots: readonly OfficeSlot[], rovers: readonly OfficeRoverView[], dt: number, now: number, reduced: boolean, cam: Vec2, lite = false): number {
  if (writes.camera(cam.x, cam.z)) for (const s of slots) c.looks[s.slot].camera = lookYaw(s, writes.cam, CREW.cameraClamp);
  let bob = 0;
  for (const r of rovers) {
    const actor = c.actors[r.slot];
    const phase = slotPhase(r.slot);
    const p = stepCrew(actor, r.state, dt, phase, reduced, c.looks[r.slot]);
    bob = Math.max(bob, crewOffset(r.state, p, phase));
    writes.pose(r.slot, p);
    const fx = crewFx(actor, reduced, c.fx[r.slot]);
    writes.glow(r.slot, crewKey(r.state, r.progress, fx, now, reduced, r.helpers, lite));
  }
  return bob;
}

/**
 * The far level of detail (design 5.9): past `farDistance` (u from the office bounds to the camera) the crew, the
 * drones, the effects and the CI tower step `farHz` times a second, the faces and desk screens repaint at most
 * `atlasFps` times a second; inside it everything steps every frame.
 */
export const OFFICE_LOD = { farDistance: 40, farHz: 4, atlasFps: 2 } as const;

export interface LodStep {
  /** Step this frame. */
  step: boolean;
  /** The time to step by (s): the frame's delta plus what accumulated since the last step; 0 when not stepping. */
  dt: number;
  /** The time carried to the next frame (s). */
  acc: number;
}

/**
 * One frame of the level of detail (pure; writes `out`, so a frame allocates nothing): inside `OFFICE_LOD.farDistance`
 * it steps every frame, past it it accumulates the frame deltas and steps once they reach `1 / farHz`, by all of them,
 * so the animations keep their real time.
 */
export function lodStep(distance: number, dt: number, acc: number, out: LodStep = { step: false, dt: 0, acc: 0 }): LodStep {
  const sum = acc + dt;
  out.step = distance <= OFFICE_LOD.farDistance || sum >= 1 / OFFICE_LOD.farHz - 1e-6;
  out.dt = out.step ? sum : 0;
  out.acc = out.step ? 0 : sum;
  return out;
}
