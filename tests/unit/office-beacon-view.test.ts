import { Vector3, type PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { floorY, LOBBY } from "@/experience/config";
import { HALL } from "@/experience/floors/lobby/hallLayout";
import { BEAM, BEACON, beaconOrigin } from "@/experience/floors/lobby/office/beacon";
import { officeHudBoxes } from "@/experience/floors/lobby/office/chipRows";
import { OFFICE, officeDock, officeDockPad } from "@/experience/floors/lobby/officeLayout";
import type { Vec2 } from "@/experience/types";
import { boxOf, followCamera, SIZES } from "../helpers/office-cameras";

/**
 * The Needs Kurniadi beacon from the Lobby (design 2026-10-20 section 5.3): the share of the column's height (its axis,
 * floor to `BEACON.h`) that projects inside the screen, from the settled follow cameras of
 * tests/unit/office-chip-placement.test.ts (`tests/helpers/office-cameras.ts`) on the seven sizes the office is tuned on.
 * From the primed spawn (the kiosk view looks south over the wing) every landscape size but the 960 x 640 tablet
 * viewport shows at least 30% of it (measured 33.7 to 77%), for a single asking Rover's origin and the plaza centre.
 * The elevator arrival view looks east at the hologram and the hall lead road's views look north-west or east into the
 * hall, with the wing behind the camera, so the column never shows there; the portrait sizes miss it from the spawn
 * too, and so does the 960 x 640 tablet viewport for desks 1 to 3 (their columns fall outside its narrower frame;
 * desks 4 and 5 and the plaza centre show 39 to 60%). Those are recorded below (they must equal the measured lists),
 * and the minimap cue (Task 8) carries the signal there.
 */

type Size = (typeof SIZES)[number];
const ORIGINS: Record<string, Vec2> = { ...Object.fromEntries([0, 1, 2, 3, 4].map((s) => [`slot ${s}`, beaconOrigin([s])])), plaza: beaconOrigin([0, 4]) };

const VIEWS: Record<string, (s: Size) => PerspectiveCamera> = {
  spawn: ({ width, height }) => followCamera(width, height, { ...LOBBY.spawn, heading: LOBBY.spawnHeading }),
  // Rolled in east along the elevator axis (the `L1:arrival` zone).
  arrival: ({ width, height }) => followCamera(width, height, { ...LOBBY.arrival, heading: Math.PI / 2 }),
  // On the hall lead road: its west end heading back to the Lobby (the plain follow view), its east end heading into the hall (`L1:highlights-entry`).
  "hall road west": ({ width, height }) => followCamera(width, height, { ...HALL.lead[0], heading: -Math.PI / 2 }),
  "hall road east": ({ width, height }) => followCamera(width, height, { ...HALL.lead[1], heading: Math.PI / 2 }),
};

/** Share of the column's axis inside the screen (in front of the camera, inside the clip square), sampled every 0.1 u. */
function onScreen(camera: PerspectiveCamera, o: Vec2, h: number = BEACON.h): number {
  const n = Math.round(h * 10) + 1;
  const v = new Vector3();
  let inside = 0;
  for (let i = 0; i < n; i++) {
    v.set(o.x, (h * i) / (n - 1), o.z).project(camera);
    if (v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) inside += 1;
  }
  return inside / n;
}

const VISIBLE = 0.3;
const landscape = (s: Size) => s.width > s.height;

/** Where the column (slot 2's origin) shows under 30% of its height: the minimap cue carries the signal there. */
const BLIND: Record<string, readonly string[]> = {
  spawn: ["portrait tablet", "tablet", "phone"],
  arrival: SIZES.map((s) => s.id),
  "hall road west": SIZES.map((s) => s.id),
  "hall road east": SIZES.map((s) => s.id),
};

describe("the beacon from the Lobby", () => {
  const measured = Object.fromEntries(
    Object.entries(VIEWS).map(([view, camera]) => [view, Object.fromEntries(SIZES.map((s) => [s.id, Object.fromEntries(Object.entries(ORIGINS).map(([o, at]) => [o, onScreen(camera(s), at)]))]))]),
  ) as Record<string, Record<string, Record<string, number>>>;

  it.each(SIZES.filter((s) => landscape(s) && !BLIND.spawn.includes(s.id)))("shows at least 30% of the column from the primed spawn on $id ($width x $height), whoever asks", ({ id }) => {
    for (const [o, share] of Object.entries(measured.spawn[id])) expect(share, `${o} from the spawn`).toBeGreaterThanOrEqual(VISIBLE);
  });

  it.each(SIZES.filter((s) => landscape(s) && s.height > 390))("keeps the rings' climb (the lowest BEACON.rise u) in frame from the primed spawn on $id ($width x $height)", ({ width, height }) => {
    const camera = VIEWS.spawn({ width, height } as Size);
    const v = new Vector3();
    for (const [o, at] of Object.entries(ORIGINS)) {
      if (measured.spawn[SIZES.find((s) => s.width === width && s.height === height)!.id][o] < VISIBLE) continue;
      v.set(at.x, BEACON.rise, at.z).project(camera);
      expect(v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1, `${o}: the rings' top in frame`).toBe(true);
    }
  });

  it("misses it exactly where recorded (the minimap cue's sizes and views)", () => {
    expect(Object.keys(BLIND)).toEqual(Object.keys(VIEWS));
    for (const view of Object.keys(VIEWS)) {
      const blind = SIZES.filter((s) => measured[view][s.id]["slot 2"] < VISIBLE).map((s) => s.id);
      expect(blind, view).toEqual(BLIND[view]);
    }
  });
});

/**
 * The production deploy beam (`BEAM.h`, 40 u over the ship dock) from the same cameras. Its foot stands in frame from
 * the primed spawn wherever the column shows there, and the beam leaves through the screen's top edge: on the desktop
 * cameras its lowest 7.7 u show (19% of its height, the screen's top 14%), on the 844 x 390 and 960 x 640 tablet
 * cameras its lowest 13.9 u (35%). A share of 40 u would not reach the column's 30% on the desktop cameras, so the bar
 * is the length shown: at least `BEAM_SHOWN` u from the foot up. The portrait sizes and the other views miss it.
 */
const BEAM_SHOWN = 6;
const BEAM_BLIND: Record<string, readonly string[]> = {
  spawn: ["portrait tablet", "phone"],
  arrival: SIZES.map((s) => s.id),
  "hall road west": SIZES.map((s) => s.id),
  "hall road east": SIZES.map((s) => s.id),
};

describe("the deploy beam from the Lobby", () => {
  const dock = officeDockPad(LOBBY.officeWing);
  const v = new Vector3();
  const inFrame = (camera: PerspectiveCamera, y: number) => {
    v.set(dock.x, y, dock.z).project(camera);
    return v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
  };

  it.each(SIZES.filter((s) => landscape(s) && !BLIND.spawn.includes(s.id)))("stands in frame from its foot up and leaves through the top edge from the primed spawn on $id ($width x $height)", (s) => {
    const camera = VIEWS.spawn(s);
    expect(inFrame(camera, 0), "the foot").toBe(true);
    expect(inFrame(camera, BEAM_SHOWN), `${BEAM_SHOWN} u up`).toBe(true);
    expect(onScreen(camera, dock, BEAM.h) * BEAM.h).toBeGreaterThanOrEqual(BEAM_SHOWN);
    // Past the visible part it runs off the top of the screen, never ending in view.
    expect(inFrame(camera, BEAM.h)).toBe(false);
    v.set(dock.x, BEAM.h, dock.z).project(camera);
    expect(v.y).toBeGreaterThan(1);
  });

  it("misses it exactly where recorded", () => {
    for (const view of Object.keys(VIEWS)) {
      const blind = SIZES.filter((s) => onScreen(VIEWS[view](s), dock, BEAM.h) * BEAM.h < BEAM_SHOWN).map((s) => s.id);
      expect(blind, view).toEqual(BEAM_BLIND[view]);
    }
  });
});

/**
 * At the office stop the beam (its foot to `BEAM.stopH`, `BEAM.r` around the dock's stack point) stands clear of the
 * desktop floor menu panel (`officeHudBoxes`) on 1440 x 900 and 1280 x 720 (owner decision 2026-10-21: the stack point
 * moved `OFFICE.dock.inward` u toward the console; measured 51 px and 58 px clear, from 4 px and 20 px at the corner's
 * middle), and wholly in frame; the tower column and the dock pad stay in frame (tests/unit/office-view.test.ts).
 */
describe("the deploy beam at the office stop", () => {
  const dock = officeDockPad(LOBBY.officeWing);
  const Y = floorY("L1");
  const points: [number, number, number][] = [];
  for (const ox of [-BEAM.r, BEAM.r]) for (const oz of [-BEAM.r, BEAM.r]) for (const y of [0, BEAM.stopH]) points.push([dock.x + ox, Y + y, dock.z + oz]);

  it.each([
    [1440, 900],
    [1280, 720],
  ])("clears the floor menu panel by 32 px or more on %i x %i", (width, height) => {
    const box = boxOf(followCamera(width, height, LOBBY.officeWing.stop), { width, height }, points);
    const menu = officeHudBoxes(width, height, "desktop")[1];
    expect(menu.x0 - box.x1).toBeGreaterThanOrEqual(32);
    expect(box.x0).toBeGreaterThan(0);
    expect(box.y0).toBeGreaterThan(0);
    expect(box.y1).toBeLessThan(height);
  });

  it("stands over the dock pad, its ring too, off the end row box", () => {
    const corner = officeDock(LOBBY.officeWing);
    expect(dock.x - (corner.minX + corner.maxX) / 2).toBeCloseTo(OFFICE.dock.inward);
    expect(dock.x + BEAM.r).toBeLessThan(corner.maxX - 0.5);
    expect(dock.x + 1.6).toBeLessThan(corner.maxX);
    expect(dock.x - BEAM.r).toBeGreaterThan(corner.minX);
  });
});
