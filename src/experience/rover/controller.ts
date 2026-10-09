import type { Vec2 } from "../types";
import { stepRover, type RoverPose, type RoverTuning, type RoverWorld } from "./movement";

export interface UpdateContext {
  tuning: RoverTuning;
  autopilotSpeed: number;
  world: RoverWorld;
}

export interface UpdateResult {
  arrived: boolean;
  blocked: boolean;
}

const ARRIVE = 0.35;
const WAYPOINT = 0.9;
const STALL_SECONDS = 1.2;

/** Owns the rover pose and an optional path. Pure TypeScript so it can be unit tested. */
export class RoverController {
  pose: RoverPose;
  path: Vec2[] = [];
  autopilot = false;
  private stalled = 0;

  constructor(start: Vec2, heading = Math.PI) {
    this.pose = { x: start.x, z: start.z, heading, speed: 0, tilt: 0 };
  }

  get following(): boolean {
    return this.path.length > 0;
  }

  setPath(points: Vec2[], autopilot = false) {
    this.path = [...points];
    this.autopilot = autopilot;
    this.stalled = 0;
  }

  clearPath() {
    this.path = [];
    this.autopilot = false;
  }

  teleport(p: Vec2, heading = this.pose.heading) {
    this.pose = { ...this.pose, x: p.x, z: p.z, heading, speed: 0, tilt: 0, blocked: false };
  }

  update(dt: number, manual: Vec2 | null, ctx: UpdateContext): UpdateResult {
    const manualActive = manual !== null && Math.hypot(manual.x, manual.z) > 1e-3;
    if (manualActive) {
      this.clearPath();
      this.pose = stepRover(this.pose, manual, dt, ctx.tuning, ctx.world);
      return { arrived: false, blocked: Boolean(this.pose.blocked) };
    }
    if (!this.path.length) {
      this.pose = stepRover(this.pose, null, dt, ctx.tuning, ctx.world);
      return { arrived: false, blocked: false };
    }

    while (this.path.length > 1 && dist(this.pose, this.path[0]) < WAYPOINT) this.path.shift();
    const target = this.path[0];
    const d = dist(this.pose, target);
    const last = this.path.length === 1;
    if (last && (d < ARRIVE || (d < 0.7 && this.pose.speed < 1))) {
      this.clearPath();
      this.pose = stepRover(this.pose, null, dt, ctx.tuning, ctx.world);
      return { arrived: true, blocked: false };
    }
    const tuning = this.autopilot ? { ...ctx.tuning, maxSpeed: ctx.autopilotSpeed } : ctx.tuning;
    const stopping = (this.pose.speed * this.pose.speed) / (2 * tuning.braking) + 0.4;
    const mag = last ? Math.max(0.2, Math.min(1, d / stopping)) : 1;
    const desire = { x: ((target.x - this.pose.x) / d) * mag, z: ((target.z - this.pose.z) / d) * mag };
    this.pose = stepRover(this.pose, desire, dt, tuning, ctx.world);

    this.stalled = this.pose.blocked ? this.stalled + dt : 0;
    if (this.stalled > STALL_SECONDS) {
      this.clearPath();
      return { arrived: false, blocked: true };
    }
    return { arrived: false, blocked: false };
  }
}

function dist(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
