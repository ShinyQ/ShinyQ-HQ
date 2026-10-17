import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import type { FloorId } from "@/content/schema";
import { ARRIVAL_HEADING, cameraBehindHeading, LOOK_EAST_YAW, railYawBehind, SHAFT_CLEAR_X, shaftClearZoom } from "@/experience/camera/arrival";
import { followOffsetScale } from "@/experience/camera/offset";
import { ZOOM_RANGE, zoneAt, zoneView, type ViewZone } from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followForward, followPose, railPose, type CameraPose, type Vec3 } from "@/experience/camera/rigs";
import { buildFloorLayouts, FLOOR_IDS, LOBBY, ROVER } from "@/experience/config";
import { buildCareerRoad, careerLayoutInput, roadZAt } from "@/experience/floors/career/layout";
import { directoryBoard, LABS } from "@/experience/floors/labs/layout";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import { buildRoofLayout, ROOF_DECK } from "@/experience/floors/roof/layout";
import { doorAt } from "@/experience/nav/doors";
import { buildNavGrid, findPath, isWalkable, segmentWalkable } from "@/experience/nav/navgrid";
import { padAt } from "@/experience/nav/pads";
import type { FloorLayout, Vec2, ViewportClass } from "@/experience/types";
import { cameraClass } from "@/lib/viewport";

/**
 * Round 8 J, L3-style arrivals (owner 2026-10-17: "the proper one is the third floor"): after a ride the rover
 * rolls on east to the floor's arrival point, and the settled camera stands behind it, looking east down the
 * floor's main axis at its main sight, clear of the elevator shaft and of the HUD.
 */
const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
const career = careerLayoutInput(data.career);
const libraryInput = libraryLayoutInput(data.library);
const layouts = buildFloorLayouts(data.years.length, { labs: data.labs.pods, career, library: libraryInput });
const road = buildCareerRoad(career);
const library = buildLibraryLayout(libraryInput);

type Safe = { top: number; bottom: number; side: number };
/** HUD-free boxes (`DESKTOP_SAFE`, `PHONE_SAFE` in e2e/hq.ts); camera class "mobile" (phones, portrait tablets) uses the phone box. */
const DESKTOP_SAFE: Safe = { top: 90, bottom: 90, side: 40 };
const PHONE_SAFE: Safe = { top: 120, bottom: 140, side: 24 };
/** Laptop, landscape tablet (camera class desktop), portrait tablet and phone (camera class mobile). */
const SIZES = [
  [1440, 900],
  [1194, 834],
  [834, 1194],
  [390, 844],
] as const;

const ZONE_ID: Record<FloorId, string> = { L1: "L1:arrival", L2: "L2:arrival", L3: "L3:overview", L4: "L4:arrival", RF: "RF:arrival" };

/** The first timeline station on L4 (the newest post north of the lane) and the point of its front nearest its door. */
const firstStation = library.stations.find((s) => s.center.z < library.floor.approach.z)!;
const stationFront: Vec2 = {
  x: Math.max(firstStation.rect.minX, Math.min(firstStation.rect.maxX, firstStation.door.x)),
  z: Math.max(firstStation.rect.minZ, Math.min(firstStation.rect.maxZ, firstStation.door.z)),
};
const dataBoard = directoryBoard("data");
const mast = buildRoofLayout().centerpiece.center;
/**
 * The RF availability sign's four corners (owner 2026-10-17: in view on arrival with the mast): `SIGN` in
 * floors/roof/SignalGarden.tsx (2.3 u out from the mast along `signYaw`, 8 u wide, from 4.2 u to 7.6 u up).
 */
const signNormal = { x: Math.sin(ROOF_DECK.signYaw), z: Math.cos(ROOF_DECK.signYaw) };
const signCenter = { x: mast.x + signNormal.x * 2.3, z: mast.z + signNormal.z * 2.3 };
const signCorners = [-1, 1].flatMap((k) =>
  [4.2, 7.6].map((y) => ({ label: `availability sign corner ${k < 0 ? "left" : "right"} ${y}`, at: [signCenter.x + k * 4 * signNormal.z, y, signCenter.z - k * 4 * signNormal.x] as Vec3 })),
);

/** The floor's main sight on arrival: what the camera looks at down the main axis. */
const SIGHTS: Record<FloorId, { label: string; at: Vec3 }[]> = {
  L1: [
    { label: "name above the profile hologram", at: [LOBBY.hologram.x, LOBBY.titleY, LOBBY.hologram.z] },
    { label: "profile hologram base", at: [LOBBY.hologram.x, 0, LOBBY.hologram.z] },
  ],
  L2: [{ label: "next year's arch", at: [road.years[1].arch.center.x, 0, road.years[1].arch.center.z] }],
  L3: [{ label: "Data and ML directory board", at: [dataBoard.center.x, (LABS.board.base + LABS.board.h) / 2, dataBoard.center.z] }],
  L4: [{ label: "first timeline station front", at: [stationFront.x, 1.5, stationFront.z] }],
  RF: [
    { label: "centerpiece base", at: [mast.x, 0, mast.z] },
    { label: "centerpiece mast and sign", at: [mast.x, 6, mast.z] },
    ...signCorners,
  ],
};

const rigOf = (floor: FloorId): "follow" | "rail" => (floor === "L2" ? "rail" : "follow");

function arrivalOf(floor: FloorId): { layout: FloorLayout; arrival: Vec2; zone: ViewZone } {
  const layout = layouts[floor];
  const arrival = layout.arrival;
  if (!arrival) throw new Error(`${floor} has no arrival`);
  const zone = zoneAt(floor, { ...arrival, heading: ARRIVAL_HEADING }, layout.viewZones);
  if (!zone) throw new Error(`${floor}: no view zone at the arrival`);
  return { layout, arrival, zone };
}

/** The camera the Director settles on with the rover at the arrival (CameraDirector: follow look-ahead and offset scale; L2 rail). */
function settledPose(floor: FloorId, w: number, h: number): { pose: CameraPose; cls: ViewportClass; zoom: number } {
  const { layout, arrival, zone } = arrivalOf(floor);
  const cls = cameraClass(w, h);
  const zoom = zoneView(zone, cls).zoom ?? 1;
  if (rigOf(floor) === "rail") {
    const axis = layout.road?.roads[0]?.points ?? [];
    return { pose: railPose(cls, arrival.x, 0, zoom, arrival.z, zone.railYaw, roadZAt(axis, arrival.x), 0, true), cls, zoom };
  }
  const forward = followForward(cls, zoneView(zone, cls).yaw);
  const ahead = FOLLOW_LOOK_AHEAD[cls];
  const target: Vec3 = [arrival.x + forward.x * ahead, 1, arrival.z + forward.z * ahead];
  return { pose: followPose(cls, target, zoneView(zone, cls).yaw, zoom * followOffsetScale(cls, w / h)), cls, zoom };
}

function cameraOf(pose: CameraPose, w: number, h: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(pose.fov, w / h, 0.1, 500);
  camera.position.set(...pose.position);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

function screen(camera: PerspectiveCamera, w: number, h: number, p: Vec3) {
  const v = new Vector3(...p).project(camera);
  return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, front: v.z < 1 };
}

function expectInside(p: { x: number; y: number; front: boolean }, w: number, h: number, safe: Safe, label: string) {
  expect(p.front, label).toBe(true);
  expect(p.x, label).toBeGreaterThanOrEqual(safe.side);
  expect(p.x, label).toBeLessThanOrEqual(w - safe.side);
  expect(p.y, label).toBeGreaterThanOrEqual(safe.top);
  expect(p.y, label).toBeLessThanOrEqual(h - safe.bottom);
}

describe("L3-style arrivals on every floor (owner 2026-10-17)", () => {
  for (const floor of FLOOR_IDS) {
    it(`${floor}: the arrival point sits on the main axis east of the approach, in its own east-facing view zone`, () => {
      const { layout, arrival, zone } = arrivalOf(floor);
      expect(zone.id).toBe(ZONE_ID[floor]);
      expect(zone.travel).toEqual({ x: 1, z: 0 });
      expect(zone.yaw).toBeCloseTo(LOOK_EAST_YAW, 9);
      if (floor === "L2") expect(zone.railYaw).toBeCloseTo(railYawBehind(), 9);
      // Arrival views apply only when primed (an arrival or a deep link); the L3 overview is an ordinary zone.
      expect(zone.arrivalOnly).toBe(floor === "L3" ? undefined : true);
      expect(arrival.z).toBe(layout.approach.z);
      expect(arrival.x).toBeGreaterThan(layout.approach.x + 5);
      // A rover driving the other way never gets the zone.
      expect(zoneAt(floor, { ...arrival, heading: -ARRIVAL_HEADING }, layout.viewZones)?.id).not.toBe(zone.id);
    });

    it(`${floor}: the roll-on drives straight from the approach to a free arrival point`, () => {
      const { layout, arrival } = arrivalOf(floor);
      const grid = buildNavGrid(layout, ROVER.radius);
      expect(isWalkable(grid, arrival)).toBe(true);
      expect(segmentWalkable(grid, layout.approach, arrival)).toBe(true);
      expect(findPath(grid, layout.approach, arrival)?.length).toBeGreaterThan(0);
      expect(doorAt(layout.doors, arrival)).toBeNull();
      expect(padAt(layout.pads, arrival)).toBeNull();
    });

    for (const [w, h] of SIZES) {
      it(`${floor}: the settled camera stands behind the rover, clear of the shaft, framing the rover and the main sight at ${w}x${h}`, () => {
        const { arrival } = arrivalOf(floor);
        const { pose, cls, zoom } = settledPose(floor, w, h);
        const rover: Vec3 = [arrival.x, 1, arrival.z];
        expect(zoom).toBeGreaterThanOrEqual(ZOOM_RANGE[0]);
        expect(zoom).toBeLessThanOrEqual(ZOOM_RANGE[1]);
        expect(zoom).toBeLessThanOrEqual(shaftClearZoom(cls, w / h, rigOf(floor), arrival.x) + 1e-9);
        expect(Math.abs(cameraBehindHeading(pose.position, rover) - ARRIVAL_HEADING)).toBeLessThan(0.1);
        expect(pose.position[0]).toBeGreaterThanOrEqual(SHAFT_CLEAR_X - 1e-9);
        const camera = cameraOf(pose, w, h);
        const safe = cls === "mobile" ? PHONE_SAFE : DESKTOP_SAFE;
        expectInside(screen(camera, w, h, rover), w, h, safe, `rover ${floor} ${w}x${h}`);
        for (const sight of SIGHTS[floor]) expectInside(screen(camera, w, h, sight.at), w, h, safe, `${sight.label} ${floor} ${w}x${h}`);
      });
    }

    it(`${floor}: keeps a tablet-class camera clear of the shaft too`, () => {
      const { arrival } = arrivalOf(floor);
      const { pose } = settledPose(floor, 1000, 750);
      expect(pose.position[0]).toBeGreaterThanOrEqual(SHAFT_CLEAR_X - 1e-9);
      expect(Math.abs(cameraBehindHeading(pose.position, [arrival.x, 1, arrival.z]) - ARRIVAL_HEADING)).toBeLessThan(0.1);
    });
  }

  it("opens a floor deep link on the arrival composition on L3, L4 and RF", () => {
    for (const floor of ["L3", "L4", "RF"] as const) expect(layouts[floor].spawn, floor).toEqual(layouts[floor].arrival);
  });

  it("keeps the Lobby session spawn at the kiosk and the L2 spawn on the approach", () => {
    expect(layouts.L1.spawn).toEqual(LOBBY.spawn);
    expect(zoneAt("L1", layouts.L1.spawn, layouts.L1.viewZones)?.id).toBe("L1:kiosk");
    expect(layouts.L2.spawn).toEqual(layouts.L2.approach);
  });

  it("parks the L2 arrival inside the first year plaza, on the road", () => {
    const { arrival } = arrivalOf("L2");
    const plaza = road.years[0].plaza;
    expect(Math.abs(arrival.x - plaza.center.x)).toBeLessThan(plaza.w / 2);
    expect(arrival.z).toBe(roadZAt(road.network.roads[0].points, arrival.x));
    // A swipe parks on a scrub stop, never inside the arrival view.
    const { zone } = arrivalOf("L2");
    for (const x of layouts.L2.scrubStops ?? []) expect(x >= zone.area.minX && x <= zone.area.maxX, `stop ${x}`).toBe(false);
  });
});
