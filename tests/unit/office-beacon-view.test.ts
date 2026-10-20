import { Vector3, type PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { LOBBY } from "@/experience/config";
import { HALL } from "@/experience/floors/lobby/hallLayout";
import { BEACON, beaconOrigin } from "@/experience/floors/lobby/office/beacon";
import type { Vec2 } from "@/experience/types";
import { followCamera, SIZES } from "../helpers/office-cameras";

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
function onScreen(camera: PerspectiveCamera, o: Vec2): number {
  const n = Math.round(BEACON.h * 10) + 1;
  const v = new Vector3();
  let inside = 0;
  for (let i = 0; i < n; i++) {
    v.set(o.x, (BEACON.h * i) / (n - 1), o.z).project(camera);
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

  it("misses it exactly where recorded (the minimap cue's sizes and views)", () => {
    expect(Object.keys(BLIND)).toEqual(Object.keys(VIEWS));
    for (const view of Object.keys(VIEWS)) {
      const blind = SIZES.filter((s) => measured[view][s.id]["slot 2"] < VISIBLE).map((s) => s.id);
      expect(blind, view).toEqual(BLIND[view]);
    }
  });
});
