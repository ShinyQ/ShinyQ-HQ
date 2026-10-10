"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { FloorId } from "@/content/schema";
import { getHQStore } from "@/store/useHQStore";
import { CAR, floorY, ROVER } from "../config";
import { scrubTarget } from "../floors/career/layout";
import { openTerminal } from "@/hud/events";
import { audio } from "@/lib/audio";
import { shouldAutoOpenTerminal } from "@/hud/RoverTerminal";
import { intents, moveVectorFromKeys, type Intent } from "../input/intents";
import { cancelMission, isAutoOpenClaimed } from "../missions/bridge";
import { joystick } from "../input/joystick";
import { doorAt, stepDoorLatch, type DoorLatch } from "../nav/doors";
import { buildNavGrid, findPath, type NavGrid } from "../nav/navgrid";
import { MAX_FRAME_DT, RoverController } from "../rover/controller";
import { faceFor } from "../rover/faces";
import { cameraRelative, type RoverTuning } from "../rover/movement";
import { roverRuntime } from "../rover/runtime";
import { advanceRide, carY, rideDirection, stageProgress } from "../tower/elevator";
import type { FloorLayout, Vec2 } from "../types";

const BLOCKED_FACE_S = 0.6;
const ARRIVED_FACE_S = 1.4;
const STORE_SYNC_S = 0.1;

const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });

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

  const state = useRef({
    controller: null as RoverController | null,
    pendingMove: null as { x: number; y: number } | null,
    blockedUntil: 0,
    arrivedUntil: 0,
    statusUntil: 0,
    lastSync: 0,
    now: 0,
    prevPhase: "",
    door: { room: null } as DoorLatch,
    /** Rover position at the end of the previous frame (swept door checks). */
  });

  useEffect(() => {
    const missionRunning = () => store.getState().mission?.status === "running";
    return intents.on((intent: Intent) => {
      // Any manual world input cancels a running mission and returns control (appendix 02).
      if ((intent.type === "goto" || intent.type === "elevator" || intent.type === "cancel" || intent.type === "scrub") && missionRunning()) cancelMission();
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
          const x = scrubTarget(controller.pose.x, intent.dx, window.innerWidth, stops);
          const path = findPath(grids[s.floor], controller.pose, { x, z: 0 });
          if (path?.length) {
            controller.setPath(path, false);
            roverRuntime.target = path[path.length - 1];
          }
          break;
        }
        case "goto": {
          // Clicking the floor while a room is open closes the drawer and drives away (appendix 02).
          if (s.phase === "room") s.closeRoom();
          if (!controller || (store.getState().phase !== "explore" && s.phase !== "elevator")) break;
          if (s.ride && s.ride.stage !== "toDoor") break;
          if (s.ride) s.cancelRide();
          const path = findPath(grids[s.floor], controller.pose, intent.point);
          if (path?.length) {
            controller.setPath(path, false);
            roverRuntime.target = path[path.length - 1];
          }
          break;
        }
        case "elevator":
          s.requestElevator(intent.to);
          break;
        case "cancel":
          if (s.phase === "intro") s.finishIntro();
          else if (s.ride?.stage === "toDoor") {
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
        case "toggle":
          if (intent.what === "sound") audio.toggleMuted();
          else if (intent.what === "lang") onToggleLang();
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
    // Shared clock with the rover mesh (flag, hop and blink timers).
    local.now = three.clock.elapsedTime;
    const now = local.now;
    const s = store.getState();

    // Greet once the intro hands control to the visitor.
    if (s.phase === "explore" && (local.prevPhase === "intro" || local.prevPhase === "boot")) {
      roverRuntime.status = labels.hello;
      local.statusUntil = now + 2;
      roverRuntime.hopUntil = now + 0.35;
      // First visit: the Rover Terminal opens once the intro hands over (appendix 02 section 4).
      if (isAutoOpenClaimed() && shouldAutoOpenTerminal()) window.setTimeout(openTerminal, 400);
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

    const canDrive = s.phase === "explore" || (s.phase === "elevator" && s.ride?.stage === "toDoor");
    const manual = canDrive && move ? cameraRelative(move, roverRuntime.cameraForward) : null;
    const tuning: RoverTuning = {
      maxSpeed: s.device.coarse ? ROVER.maxSpeedCoarse : ROVER.maxSpeedFine,
      accel: ROVER.accel,
      braking: ROVER.braking,
      turnRate: ROVER.turnRate,
      radius: ROVER.radius,
      maxTilt: ROVER.maxTilt,
    };

    let y = floorY(s.floor);
    const ride = s.ride;
    if (ride) {
      const from = layouts[ride.from];
      const to = layouts[ride.to];
      const p = stageProgress(ride, s.reducedMotion);
      let atDoor = false;
      if (ride.stage === "toDoor") {
        if (manual) {
          // Manual input cancels the autopilot drive to the elevator.
          s.cancelRide();
          controller.clearPath();
          local.blockedUntil = now + BLOCKED_FACE_S;
        } else {
          if (ride.t === 0 && !controller.autopilot) controller.clearPath();
          const d = Math.hypot(controller.pose.x - from.approach.x, controller.pose.z - from.approach.z);
          atDoor = d < 0.8;
          if (!atDoor && !controller.following) {
            const path = findPath(grids[ride.from], controller.pose, from.approach);
            if (path?.length) controller.setPath(path, true);
            else atDoor = true;
          }
          const result = controller.step(dt, null, { tuning, autopilotSpeed: ROVER.autopilotSpeed, world: from });
          if (result.arrived) atDoor = true;
        }
      } else if (ride.stage === "boarding") {
        controller.teleport(lerp2(from.approach, CAR, p), -Math.PI / 2);
      } else if (ride.stage === "exiting") {
        controller.teleport(lerp2(CAR, to.approach, p), Math.PI / 2);
      } else {
        controller.teleport(CAR, ride.stage === "opening" ? Math.PI / 2 : -Math.PI / 2);
      }
      y = carY(ride, s.reducedMotion);

      if (store.getState().ride) {
        const next = advanceRide(ride, dt, { atDoor, reduced: s.reducedMotion });
        if (next) s.setRide(next);
        else {
          controller.teleport(to.approach, Math.PI / 2);
          s.arriveFloor(ride.to);
          audio.play("ding");
          local.arrivedUntil = now + ARRIVED_FACE_S;
          y = floorY(ride.to);
        }
      }
      roverRuntime.target = null;
    } else if (s.phase === "explore" || s.phase === "room" || s.phase === "hologram") {
      // With a room open the rover finishes its path but takes no manual input.
      const request = roverRuntime.autopilot;
      if (request?.state === "pending" && !manual) {
        const path = findPath(grids[s.floor], controller.pose, request.point);
        if (path?.length) {
          controller.setPath(path, true);
          request.state = "driving";
        } else request.state = "done";
      }
      const result = controller.step(dt, manual, { tuning, autopilotSpeed: ROVER.autopilotSpeed, world: layouts[s.floor] });
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
    const open = stepDoorLatch(local.door, door?.room ?? null, {
      explore: s.phase === "explore",
      following: controller.following,
      now,
      speed: controller.pose.speed,
    });
    if (open) intents.emit({ type: "open", room: open });

    const pose = controller.pose;
    audio.setRumble(pose.speed);
    const liveRide = store.getState().ride;
    roverRuntime.x = pose.x;
    roverRuntime.y = y;
    roverRuntime.z = pose.z;
    roverRuntime.heading = pose.heading;
    roverRuntime.speed = pose.speed;
    roverRuntime.tilt = pose.tilt;
    roverRuntime.face = faceFor({
      phase: s.phase,
      speed: pose.speed,
      autopilot: controller.autopilot,
      now,
      blockedUntil: local.blockedUntil,
      arrivedUntil: local.arrivedUntil,
      ride: liveRide && liveRide.stage !== "toDoor" ? rideDirection(liveRide) : null,
    });
    if (liveRide) roverRuntime.status = `to ${liveRide.to}`;
    else if (now > local.statusUntil) roverRuntime.status = undefined;

    if (now - local.lastSync > STORE_SYNC_S) {
      local.lastSync = now;
      roverRuntime.drawCalls = three.gl.info.render.calls;
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
