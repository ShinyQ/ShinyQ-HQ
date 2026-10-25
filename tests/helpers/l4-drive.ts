import { PerspectiveCamera } from "three";
import { buildExperienceData } from "@/content/experience";
import { ARRIVAL_HEADING } from "@/experience/camera/arrival";
import { cameraWorld, clampCamera } from "@/experience/camera/collision";
import { CAMERA_FAR, CAMERA_NEAR } from "@/experience/camera/firstPerson";
import { followOffsetScale } from "@/experience/camera/offset";
import { activeZone, createOrbitState, primeZone, setPitchRange, stepOrbit, updateZone, zoneAt, type OrbitState } from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followForward, followPose, pitchRange } from "@/experience/camera/rigs";
import { buildFloorLayouts, floorY, ROVER } from "@/experience/config";
import type { EndPlazaLabels } from "@/experience/floors/library/decor/EndPlaza";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import { buildNavGrid } from "@/experience/nav/navgrid";
import { buildRoadGraph } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import type { Vec2, ViewportClass } from "@/experience/types";
import { formatYearMonth } from "@/lib/format";
import { cameraClass } from "@/lib/viewport";
import en from "../../messages/en.json";

/**
 * The real L4 floor and its follow camera without a renderer, for the L4 label sweeps
 * (`tests/unit/library-label-sweep.test.ts`, `tests/unit/end-plaza-label-sweep.test.ts`, `tests/unit/floor-sign-facing.test.ts`).
 */
const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
export const l4Data = buildExperienceData("en", FLOOR_NAMES);
const input = libraryLayoutInput(l4Data.library);
export const l4Layout = buildLibraryLayout(input);
export const l4Floor = buildFloorLayouts(l4Data.years.length, { library: input }).L4;
export const l4Net = l4Floor.road!;
const grid = buildNavGrid(l4Floor, ROVER.radius);
const graph = buildRoadGraph(l4Net);
const world = cameraWorld(l4Floor, floorY("L4"));
export const L4_FLOOR_Y = floorY("L4");

/** The end plaza sign texts as `Experience.tsx` writes them (English). */
const metrics = l4Data.library.researchMetrics;
const M = en.library.topics.monument;
export const l4EndLabels: EndPlazaLabels = {
  pieces: (count, topic) => `${count} pieces on ${topic}`,
  monument: metrics
    ? {
        citations: String(metrics.citations),
        citationsLabel: M.citations,
        hIndex: String(metrics.hIndex),
        hIndexLabel: M.hIndex,
        source: M.asOf.replace("{source}", metrics.source).replace("{date}", formatYearMonth(metrics.asOf, "en")),
      }
    : null,
  vault: en.hud.interact.studyVault,
};

/** The rover and the follow camera, driven like the rendered sweeps (`driveTo`) and settled like `CameraDirector`. */
export class L4Drive {
  readonly orbit: OrbitState = createOrbitState();
  readonly cls: ViewportClass;
  pos: Vec2 & { heading: number };

  constructor(readonly size: { width: number; height: number }) {
    this.cls = cameraClass(size.width, size.height);
    setPitchRange(this.orbit, pitchRange(this.cls, "follow"));
    // A deep link spawns on the arrival point heading east and opens on the arrival view.
    this.pos = { ...l4Floor.spawn, heading: ARRIVAL_HEADING };
    primeZone(this.orbit, zoneAt("L4", this.pos, l4Floor.viewZones), this.cls);
  }

  /** Drives the autopilot route to `to` in small steps, tracking the view zones on the way, then lets the camera settle. */
  to(to: Vec2) {
    const route = roadRoute(l4Net, grid, this.pos, to, graph) ?? [to];
    for (const p of route) {
      const dx = p.x - this.pos.x;
      const dz = p.z - this.pos.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const heading = Math.atan2(dx, dz);
      const from = { ...this.pos };
      const steps = Math.ceil(len / 0.25);
      for (let k = 1; k <= steps; k++) {
        this.pos = { x: from.x + (dx * k) / steps, z: from.z + (dz * k) / steps, heading };
        updateZone(this.orbit, activeZone(zoneAt("L4", this.pos, l4Floor.viewZones), this.orbit), false, this.cls);
        stepOrbit(this.orbit, 0.25 / ROVER.autopilotSpeed, false);
      }
    }
    stepOrbit(this.orbit, 1, true);
  }

  /** The settled follow camera (look-ahead along the view, offset scale, camera collision). */
  camera(): PerspectiveCamera {
    const { width, height } = this.size;
    const roverTarget: [number, number, number] = [this.pos.x, L4_FLOOR_Y + 1, this.pos.z];
    const f = followForward(this.cls, this.orbit.yaw);
    const ahead = FOLLOW_LOOK_AHEAD[this.cls];
    const pose = followPose(this.cls, [roverTarget[0] + f.x * ahead, roverTarget[1], roverTarget[2] + f.z * ahead], this.orbit.yaw, this.orbit.zoom * followOffsetScale(this.cls, width / height), this.orbit.pitch);
    const position = clampCamera(pose.target, pose.position, world, roverTarget, pose.fov);
    const camera = new PerspectiveCamera(pose.fov, width / height, CAMERA_NEAR, CAMERA_FAR);
    camera.position.set(...position);
    camera.lookAt(...pose.target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    return camera;
  }
}
