"use client";

import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import type { WebGLRenderer } from "three";
import type { FloorId, RoomId } from "@/content/schema";
import { getHQStore, type HQState } from "@/store/useHQStore";
import { scrubSign } from "../camera/rigs";
import { CAR, floorY, ROVER } from "../config";
import { roadZAt, scrubTarget } from "../floors/career/layout";
import { floorChunks, rideChunkHold } from "../floors/floorChunks";
import { openCv, openPalette, openTerminal } from "@/hud/events";
import { audio } from "@/lib/audio";
import { intents, moveVectorFromKeys, type Intent } from "../input/intents";
import { REACTOR_ROOM } from "../floors/labs/techReactor";
import { performInteract } from "../interact/pick";
import { cancelMission, goToRoom, runMissionSteps } from "../missions/bridge";
import { joystick } from "../input/joystick";
import { doorAt, openEndsPath, stepDoorLatch, type DoorLatch } from "../nav/doors";
import { distanceToElevator, elevatorBeam, shouldBeamToCar } from "../nav/fastReturn";
import { pickerFor, primedPadLatch, stepPadLatch } from "../nav/pads";
import { buildNavGrid, findPath, type NavGrid } from "../nav/navgrid";
import { buildRoadGraph, routeUsesRoad, type RoadGraph } from "../nav/road";
import { roadRoute } from "../nav/roadRoute";
import { advanceBeam, startBeam } from "../nav/teleport";
import { MAX_FRAME_DT, RoverController } from "../rover/controller";
import { askFace } from "../rover/askFace";
import { faceFor } from "../rover/faces";
import { boostOn, boostTuning, stepBoostLevel } from "../rover/boost";
import { cameraRelative, type RoverTuning } from "../rover/movement";
import { roverRuntime } from "../rover/runtime";
import { renderStats } from "../perf/renderStats";
import { perfOverlayOn } from "../perf/lines";
import { advanceRide, carY, rideCap, rideDirection, stageProgress, trackFrameDt, TYPICAL_FRAME_DT } from "../tower/elevator";
import { destinationReady, ridePrep } from "../tower/ridePrep";
import { beamNow, clearBeam, clearRide, keepBeam, keepRide, rideNow } from "../tower/rideClock";
import { finishRideStats, formatRideSummary, startRideStats, stepRideStats, type RideStats } from "../tower/rideStats";
import type { FloorLayout, Vec2 } from "../types";
import { renderProbe } from "./renderProbe";

const BLOCKED_FACE_S = 0.6;
const ARRIVED_FACE_S = 1.4;
const STORE_SYNC_S = 0.1;

const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
/** Shader programs three has linked so far (grows when a material needs a new program). */
const programCount = (gl: WebGLRenderer) => gl.info.programs?.length ?? 0;

/**
 * Fast return (Express Return pads): beams the rover onto the floor's elevator call pad, facing the car.
 * Only while exploring with no ride, beam or picker; any drive (autopilot, scrub, point-and-go) ends here.
 */
function beamHome(s: HQState, controller: RoverController, layout: FloorLayout): boolean {
  if (s.phase !== "explore" || s.ride || s.beam || s.picker) return false;
  controller.clearPath();
  roverRuntime.target = null;
  roverRuntime.autopilot = null;
  s.setBeam(elevatorBeam(controller.pose, layout));
  audio.play("whoosh");
  return true;
}

export interface DirectorProps {
  layouts: Record<FloorId, FloorLayout>;
  held: RefObject<Set<string>>;
  labels: { hello: string };
  onToggleLang: () => void;
}

/** Owns the per-frame loop: input, elevator ride, rover controller, faces and store sync. */
export function Director({ layouts, held, labels, onToggleLang }: DirectorProps) {
  const store = getHQStore();
  const grids = useMemo(() => {
    const out = {} as Record<FloorId, NavGrid>;
    for (const id of Object.keys(layouts) as FloorId[]) out[id] = buildNavGrid(layouts[id], ROVER.radius);
    return out;
  }, [layouts]);
  const roads = useMemo(() => {
    const out: Partial<Record<FloorId, RoadGraph>> = {};
    for (const id of Object.keys(layouts) as FloorId[]) {
      const road = layouts[id].road;
      if (road) out[id] = buildRoadGraph(road);
    }
    return out;
  }, [layouts]);
  /** Autopilot route: along the floor's road when it has one (walkable floors; on L1 only into or out of the hall), else the navgrid. */
  const autopilotPath = useCallback(
    (floor: FloorId, from: Vec2, to: Vec2) => {
      const layout = layouts[floor];
      return routeUsesRoad(layout, from, to) ? roadRoute(layout.road!, grids[floor], from, to, roads[floor]) : findPath(grids[floor], from, to);
    },
    [layouts, grids, roads],
  );

  const state = useRef({
    controller: null as RoverController | null,
    pendingMove: null as { x: number; y: number } | null,
    blockedUntil: 0,
    arrivedUntil: 0,
    statusUntil: 0,
    lastSync: 0,
    now: 0,
    /** Moving average of recent frame times: sets how much ride time one frame may add (`rideCap`). */
    typicalDt: TYPICAL_FRAME_DT,
    /** Measurements of the running ride (`window.__hq.ridePrep.lastRide` once it ends). */
    rideStats: null as RideStats | null,
    /** `?perf=1` (`perfOverlayOn`, shared with the overlay): log every ride's summary to the console (owner check on real devices). */
    perf: typeof window !== "undefined" && perfOverlayOn(window.location.search),
    prevPhase: "",
    door: { room: null } as DoorLatch,
    /** Floor pads (elevator call pad, L2 teleporters) run the door latch with pad ids. */
    pad: { room: null } as DoorLatch<string>,
    /** Pickers (and Return beams) the pad latch has started; point-and-go skips its own action when the latch got there first. */
    padOpens: 0,
    /** The running ride already decided between driving to the door and beaming into the car (fast return). */
    boardChecked: false,
    /**
     * Room opened since the last frame. A drawer can open and close again between two frames (a
     * quick Esc on a slow device), so the door latch learns about opens from the store, not the phase.
     */
    opened: null as RoomId | null,
    /** The rover's path (`RoverController.pathId`) when `opened` opened. */
    openedOnPath: null as number | null,
  });

  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.activeRoom && s.activeRoom !== prev.activeRoom) {
          state.current.opened = s.activeRoom;
          state.current.openedOnPath = state.current.controller?.pathId ?? null;
        }
      }),
    [store],
  );

  useEffect(() => {
    const missionRunning = () => store.getState().mission?.status === "running";
    return intents.on((intent: Intent) => {
      // Any manual world input cancels a running mission and returns control (appendix 02).
      if ((intent.type === "interact" || intent.type === "elevator" || intent.type === "cancel" || intent.type === "scrub" || intent.type === "teleport") && missionRunning()) cancelMission();
      const s = store.getState();
      const local = state.current;
      const controller = local.controller;
      switch (intent.type) {
        case "move":
          local.pendingMove = { x: intent.x, y: intent.y };
          break;
        case "scrub": {
          // Rail floors: a horizontal swipe travels to a year stop (appendix 03 section 3).
          const stops = layouts[s.floor].scrubStops;
          if (!controller || !stops?.length) break;
          if (s.phase === "room") s.closeRoom();
          if (store.getState().phase !== "explore") break;
          // Turned around (the camera orbits 360 degrees), a swipe still moves toward the side it pulls from.
          const x = scrubTarget(controller.pose.x, intent.dx * scrubSign(roverRuntime.cameraRailYaw), window.innerWidth, stops);
          // Land on the road (the Career Road meanders in z), else on the rail axis.
          const z = roadZAt(layouts[s.floor].road?.roads[0]?.points ?? [], x);
          const path = findPath(grids[s.floor], controller.pose, { x, z });
          if (path?.length) {
            controller.setPath(path, false);
            roverRuntime.target = path[path.length - 1];
          }
          break;
        }
        case "interact": {
          // Point-and-go (owner request): drive to the target along the road, then run its action. The
          // drive is a mission leg, so manual input cancels it like any mission.
          if (s.phase !== "explore" && s.phase !== "room" && s.phase !== "elevator") break;
          if (s.beam || s.picker || (s.ride && s.ride.stage !== "toDoor")) break;
          if (s.ride) {
            s.cancelRide();
            controller?.clearPath();
          }
          // The drive ends with the rover stopping on the pad, so the pad latch may open the same picker
          // before this promise resolves; opening it again would undo an Esc pressed in between.
          const padOpensBefore = local.padOpens;
          void performInteract(intent.item, {
            rover: () => (local.controller ? { x: local.controller.pose.x, z: local.controller.pose.z } : { x: roverRuntime.x, z: roverRuntime.z }),
            goToRoom,
            runSteps: runMissionSteps,
            openPicker: (picker) => {
              if (local.padOpens !== padOpensBefore) return;
              if (store.getState().phase === "room") store.getState().closeRoom();
              store.getState().openPicker(picker);
              if (!store.getState().picker) return;
              audio.play("beep");
              // The picker consumes the pad under the rover now, not on the next frame: an Esc before
              // that frame would otherwise let the latch open it again.
              const pose = local.controller?.pose ?? roverRuntime;
              local.pad = primedPadLatch(layouts[store.getState().floor].pads, pose);
            },
            command: (command) => {
              if (command.type === "terminal") intents.emit({ type: "terminal" });
              else if (command.type === "palette") openPalette(command.filter);
              else if (command.type === "reactor") {
                store.getState().setReactorRing(command.ring);
                store.getState().openRoom(REACTOR_ROOM);
              } else if (command.type === "open") store.getState().openRoom(command.room);
              else openCv();
            },
            beamHome: () => {
              if (local.padOpens !== padOpensBefore || !local.controller) return;
              const live = store.getState();
              beamHome(live, local.controller, layouts[live.floor]);
            },
          });
          break;
        }
        case "elevator":
          s.requestElevator(intent.to);
          break;
        case "cancel":
          // Esc never skips the boot or the intro (owner decision); it stops elevator drives and scrub drives.
          if (s.phase === "boot" || s.phase === "intro") break;
          // A beam (teleport, Return pad, into the car) always lands; Esc does not cut it short.
          if (s.beam) break;
          if (s.ride?.stage === "toDoor") {
            s.cancelRide();
            controller?.clearPath();
            local.blockedUntil = local.now + BLOCKED_FACE_S;
          } else if (controller?.following) {
            controller.clearPath();
            roverRuntime.target = null;
          }
          break;
        case "open":
          if (s.phase === "explore" || s.phase === "room") s.openRoom(intent.room);
          break;
        case "teleport": {
          // L2 year teleporters: beam to the chosen plaza's pad. Any drive (autopilot, scrub) ends here.
          const pad = layouts[s.floor].pads?.find((p) => p.id === intent.pad);
          if (!controller || !pad || s.phase !== "explore" || s.ride || s.beam) break;
          // The L2 time console's "Back to elevator": the same beam as a Return pad (fast return).
          if (pad.kind === "elevator") {
            beamHome(s, controller, layouts[s.floor]);
            break;
          }
          controller.clearPath();
          roverRuntime.target = null;
          roverRuntime.autopilot = null;
          s.setBeam(startBeam(controller.pose, pad));
          audio.play("whoosh");
          break;
        }
        case "toggle":
          if (intent.what === "sound") audio.toggleMuted();
          else if (intent.what === "lang") onToggleLang();
          // The HUD owns the other toggles (readme, map, settings).
          break;
        case "terminal":
          if (s.phase === "explore") {
            roverRuntime.hopUntil = local.now + 0.35;
            audio.play("beep");
            openTerminal();
          }
          break;
        default:
          break;
      }
    });
  }, [store, grids, layouts, onToggleLang]);

  useFrame((three, rawDt) => {
    const dt = Math.min(rawDt, MAX_FRAME_DT);
    const local = state.current;
    local.typicalDt = trackFrameDt(local.typicalDt, rawDt);
    // Shared clock with the rover mesh (flag, hop and blink timers).
    local.now = three.clock.elapsedTime;
    const now = local.now;
    const s = store.getState();
    if (!s.ride) {
      local.rideStats = null;
      local.boardChecked = false;
    }
    // Whole-frame totals of the last frame (every render pass), from RenderCounter (runs first each frame).
    renderProbe.record(renderStats.sceneCalls + renderStats.postCalls, renderStats.triangles);

    // Greet once the intro hands control to the visitor (the first-session tour is OnboardingLayer's).
    if (s.phase === "explore" && (local.prevPhase === "intro" || local.prevPhase === "boot")) {
      roverRuntime.status = labels.hello;
      local.statusUntil = now + 2;
      roverRuntime.hopUntil = now + 0.35;
    }
    local.prevPhase = s.phase;

    if (roverRuntime.cancelFlash) {
      roverRuntime.cancelFlash = false;
      local.blockedUntil = now + BLOCKED_FACE_S;
      local.controller?.clearPath();
      roverRuntime.target = null;
    }

    if (!local.controller) {
      local.controller = new RoverController({ x: s.rover.x, z: s.rover.z }, s.rover.heading);
      // Starting inside a door zone (resume, re-entry) must not reopen a room the visitor closed.
      local.door.room = doorAt(layouts[s.floor].doors, local.controller.pose)?.room ?? null;
      // A deep link to L2 spawns on the elevator pad: it must not ask for a floor until the rover leaves it.
      local.pad = primedPadLatch(layouts[s.floor].pads, local.controller.pose);
    }
    const controller = local.controller;

    // Held keys and the joystick emit `move` every frame (appendix 03 section 3).
    const keys = moveVectorFromKeys(held.current ?? []);
    const stick = joystick.active ? { x: joystick.x, y: joystick.y } : null;
    const input = keys.x || keys.y ? keys : stick && (stick.x || stick.y) ? stick : null;
    if (input) intents.emit({ type: "move", x: input.x, y: input.y });
    const move = local.pendingMove;
    local.pendingMove = null;
    if (move && s.mission?.status === "running") cancelMission();

    // Beams (L2 year teleports, Return pads, far floor changes into the car): the rover holds still while
    // the beam rises, jumps to the target pad (the camera cuts with it), then the beam fades. Reduced
    // motion makes it a 150 ms fade cut (BeamFade in the HUD).
    if (s.beam) {
      const beam = beamNow(s.beam);
      const step = advanceBeam(beam, dt, s.reducedMotion);
      if (step.jump) {
        controller.teleport(beam.to, beam.heading);
        roverRuntime.cameraSnap = true;
      }
      // Progress stays in the motion clock; the store changes when the rover jumps and when the beam ends.
      if (step.beam && !step.jump) keepBeam(s.beam, step.beam);
      else {
        clearBeam();
        s.setBeam(step.beam);
      }
    }
    const canDrive = !s.beam && (s.phase === "explore" || (s.phase === "elevator" && s.ride?.stage === "toDoor"));
    const manual = canDrive && move ? cameraRelative(move, roverRuntime.cameraForward) : null;
    const tuning: RoverTuning = {
      maxSpeed: s.device.coarse ? ROVER.maxSpeedCoarse : ROVER.maxSpeedFine,
      accel: ROVER.accel,
      braking: ROVER.braking,
      turnRate: ROVER.turnRate,
      radius: ROVER.radius,
      maxTilt: ROVER.maxTilt,
    };
    // Hold Shift or the touch boost button for about 2x speed: manual driving only, never the autopilot.
    const boosting = boostOn(manual, held.current ?? [], joystick.boost);
    const driveTuning = boostTuning(tuning, boosting);

    let y = floorY(s.floor);
    const stored = s.ride;
    const ride = stored ? rideNow(stored) : null;
    if (ride && stored) {
      const from = layouts[ride.from];
      const to = layouts[ride.to];
      const p = stageProgress(ride, s.reducedMotion);
      let atDoor = false;
      if (ride.stage === "toDoor") {
        if (s.beam) {
          // Fast return: beaming into the car. The rover holds still; the jump lands it on the call pad,
          // so the ride boards on the jump frame (a year teleport still running keeps the ride waiting).
          atDoor = distanceToElevator(controller.pose, from) < 0.8;
        } else if (manual) {
          // Manual input cancels the autopilot drive to the elevator.
          s.cancelRide();
          controller.clearPath();
          local.blockedUntil = now + BLOCKED_FACE_S;
        } else {
          if (ride.t === 0) {
            // A drive still running on the floor being left (the arrival roll-on of a floor called
            // again at once) ends here: its point is in that floor's coordinates.
            if (roverRuntime.autopilot && roverRuntime.autopilot.state !== "done") {
              roverRuntime.autopilot = null;
              controller.clearPath();
            } else if (!controller.autopilot) controller.clearPath();
          }
          // Fast return (owner decision): farther than FAST_RETURN.beamDistance from the call pad, every
          // floor change (panel, keys, swipe, pad picker, Cmd-K, missions) beams into the car instead of driving.
          let beaming = false;
          if (!local.boardChecked) {
            local.boardChecked = true;
            if (shouldBeamToCar(controller.pose, from)) {
              controller.clearPath();
              roverRuntime.target = null;
              s.setBeam(elevatorBeam(controller.pose, from));
              audio.play("whoosh");
              beaming = true;
            }
          }
          if (!beaming) {
            const d = distanceToElevator(controller.pose, from);
            atDoor = d < 0.8;
            if (!atDoor && !controller.following) {
              const path = autopilotPath(ride.from, controller.pose, from.approach);
              if (path?.length) controller.setPath(path, true);
              else atDoor = true;
            }
            const result = controller.step(dt, null, { tuning, autopilotSpeed: ROVER.autopilotSpeed, world: from });
            if (result.arrived) atDoor = true;
          }
        }
      } else if (ride.stage === "boarding") {
        controller.teleport(lerp2(from.approach, CAR, p), -Math.PI / 2);
      } else if (ride.stage === "exiting") {
        controller.teleport(lerp2(CAR, to.approach, p), Math.PI / 2);
      } else {
        controller.teleport(CAR, ride.stage === "opening" ? Math.PI / 2 : -Math.PI / 2);
      }
      y = carY(ride, s.reducedMotion);
      if (ride.stage !== "toDoor") {
        local.rideStats ??= startRideStats(ride.from, ride.to, Math.abs(floorY(ride.to) - floorY(ride.from)));
        stepRideStats(local.rideStats, { stage: ride.stage, y, frameDt: rawDt, held: ride.held ?? 0, chunkHeld: ride.chunkHeld ?? 0, programs: programCount(three.gl) });
      }

      if (store.getState().ride) {
        // The destination's code chunk loads now if no prefetch did (Round 7 B); the car waits for it, and a failed import releases it.
        const next = advanceRide(ride, dt, {
          atDoor,
          reduced: s.reducedMotion,
          ready: destinationReady(ride.to),
          hold: rideChunkHold(floorChunks, ride.to),
          cap: rideCap(local.typicalDt),
        });
        // Progress within a stage stays in the motion clock; the store changes when a stage starts or the ride ends.
        if (next && next.stage === ride.stage) keepRide(stored, next);
        else if (next) {
          clearRide();
          s.setRide(next);
        } else {
          clearRide();
          controller.teleport(to.approach, Math.PI / 2);
          // The rover steps out onto the new floor's elevator pad: it stays quiet until the rover leaves it.
          local.pad = primedPadLatch(to.pads, to.approach);
          s.arriveFloor(ride.to);
          // Floors with an arrival spot roll the rover on from the shaft (a mission's drive replaces it).
          if (to.arrival && (!roverRuntime.autopilot || roverRuntime.autopilot.state === "done")) roverRuntime.autopilot = { point: to.arrival, state: "pending" };
          audio.play("ding");
          if (local.rideStats) {
            const summary = finishRideStats(local.rideStats, programCount(three.gl));
            ridePrep.lastRide = summary;
            if (local.perf) console.info(formatRideSummary(summary));
            local.rideStats = null;
          }
          local.arrivedUntil = now + ARRIVED_FACE_S;
          y = floorY(ride.to);
        }
      }
      roverRuntime.target = null;
    } else if (s.phase === "explore" || s.phase === "room" || s.phase === "hologram") {
      // With a room open the rover finishes its path but takes no manual input.
      const request = roverRuntime.autopilot;
      if (request?.state === "pending" && !manual) {
        const path = autopilotPath(s.floor, controller.pose, request.point);
        if (path?.length) {
          controller.setPath(path, true);
          request.state = "driving";
        } else request.state = "done";
      }
      const result = controller.step(dt, manual, { tuning: driveTuning, autopilotSpeed: ROVER.autopilotSpeed, world: layouts[s.floor] });
      if (manual) roverRuntime.target = null;
      if (request?.state === "driving" && (result.arrived || result.blocked || manual || !controller.following)) request.state = "done";
      if (result.arrived) {
        local.arrivedUntil = now + ARRIVED_FACE_S;
        roverRuntime.flagUntil = now + ARRIVED_FACE_S;
        roverRuntime.flagAt = { x: controller.pose.x, z: controller.pose.z };
        roverRuntime.hopUntil = now + 0.35;
        roverRuntime.target = null;
      }
      if (result.blocked || (manual && controller.pose.blocked && controller.pose.speed > 4)) {
        local.blockedUntil = now + BLOCKED_FACE_S;
        roverRuntime.target = null;
      }
    }

    // Door triggers (every floor): fire once the rover stops or slows on a door pad, or stays on it
    // for a moment. Driving past (or along a path through) a pad does not open the room.
    const doors = layouts[s.floor].doors;
    const door = s.ride ? null : doorAt(doors, controller.pose);
    // Opening a room ends any drive toward it, so the rover does not keep rolling onto the pad behind
    // (or after) the drawer. Every drive and ride closes the room first, so no other path is cut; a room
    // that opened and closed again before this frame ends only the path it interrupted (`openEndsPath`).
    const opened = s.phase === "room" ? s.activeRoom : local.opened;
    const openedOnPath = local.openedOnPath;
    local.opened = null;
    local.openedOnPath = null;
    if (opened && controller.following && openEndsPath(s.phase === "room", openedOnPath, controller.pathId)) {
      controller.clearPath();
      roverRuntime.target = null;
    }
    const open = stepDoorLatch(local.door, door?.room ?? null, {
      openRoom: opened,
      explore: s.phase === "explore",
      // A running mission opens its rooms itself; a pad firing first would reopen after the visitor closes it.
      following: controller.following || s.mission?.status === "running",
      now,
      speed: controller.pose.speed,
      heading: controller.pose.heading,
      facing: door?.facing,
    });
    if (open) intents.emit({ type: "open", room: open });

    // Floor pads: the door rules (stop or slow on the pad, or stay PAD.dwell), read from the live state
    // so a ride that ended this frame already sees the new floor's primed pad. A beam, a picker or any
    // other phase latches the pad under the rover instead.
    const live = store.getState();
    const padHit = stepPadLatch(local.pad, layouts[live.floor].pads, controller.pose, {
      riding: live.ride !== null,
      explore: live.phase === "explore" && !live.beam && !live.picker,
      following: controller.following || live.mission?.status === "running",
      now,
      speed: controller.pose.speed,
    });
    if (padHit) {
      local.padOpens++;
      // Express Return pads beam to the elevator call pad; the others open their picker.
      if (padHit.kind === "return") beamHome(live, controller, layouts[live.floor]);
      else {
        live.openPicker(pickerFor(padHit));
        audio.play("beep");
      }
    }

    const pose = controller.pose;
    roverRuntime.boost = stepBoostLevel(roverRuntime.boost, boosting && pose.speed > 1, dt);
    audio.setRumble(pose.speed);
    const liveRide = store.getState().ride;
    roverRuntime.x = pose.x;
    roverRuntime.y = y;
    roverRuntime.z = pose.z;
    roverRuntime.heading = pose.heading;
    roverRuntime.speed = pose.speed;
    roverRuntime.tilt = pose.tilt;
    // The camera holds third person while the rover follows a path (autopilot, scrub, mission leg, elevator approach).
    roverRuntime.driving = controller.following;
    const rideFace = liveRide && liveRide.stage !== "toDoor" ? rideDirection(liveRide) : null;
    roverRuntime.face = (!rideFace && askFace()) || faceFor({
      phase: s.phase,
      speed: pose.speed,
      autopilot: controller.autopilot,
      now,
      blockedUntil: local.blockedUntil,
      arrivedUntil: local.arrivedUntil,
      ride: rideFace,
    });
    if (liveRide) roverRuntime.status = `to ${liveRide.to}`;
    else if (now > local.statusUntil) roverRuntime.status = undefined;

    if (now - local.lastSync > STORE_SYNC_S) {
      local.lastSync = now;
      // Whole-frame totals (scene plus post passes), counted by RenderCounter.
      roverRuntime.drawCalls = renderStats.sceneCalls + renderStats.postCalls;
      roverRuntime.triangles = renderStats.triangles;
      s.setRover({
        x: pose.x,
        z: pose.z,
        heading: pose.heading,
        speed: pose.speed,
        face: roverRuntime.face,
        status: roverRuntime.status,
      });
    }
  });

  return null;
}
