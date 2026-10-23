import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { ROTATE_STEP, rotate, stepOrbit } from "@/experience/camera/orbit";
import { FLOOR_COLOR } from "@/experience/config";
import { yearMarkerSigns } from "@/experience/floors/career/labels";
import { buildCareerRoad, careerLayoutInput, labelFade } from "@/experience/floors/career/layout";
import { stationTitles } from "@/experience/floors/library/decor/common";
import { createLibraryFrame, libraryLabelFrame, libraryPlateHalves } from "@/experience/floors/library/decor/signFrame";
import { librarySigns } from "@/experience/floors/library/decor/signs";
import type { LibraryZone } from "@/experience/floors/library/model";
import { SIGN_HIDDEN, signFacing, signFacingDot, type SignSpec } from "@/experience/fx/signLayout";
import type { Vec2 } from "@/experience/types";
import en from "../../messages/en.json";
import { L4_FLOOR_Y, L4Drive, l4Data, l4Layout } from "../helpers/l4-drive";
import { realLayouts } from "../helpers/real-layouts";

/**
 * Floor words float as signs that face the camera (spectacle round, owner request 2026-10-13), without a renderer, for
 * L2 and L4 (they replaced the rendered L2 and L4 cases of `e2e/spectacle.spec.ts`, which keeps L3 to prove the facing
 * in the renderer and scans every floor's live scene for flat words). The signs each floor builds, shown as
 * `FloatingSigns` shows them (the L2 fade along x, the L4 screen placement), from the e2e poses: at least one sign shows
 * and every shown sign turns square to the camera (`signFacing`, the yaw `FloatingSigns` gives it each frame) from the
 * default view and views turned around the rover.
 */

/** The facing `FloatingSigns` reports in `__hq.probes.signs` for a sign at `at` seen from `camera`. */
const facing = (at: Vec2, camera: Vec2) => signFacingDot(signFacing(at, camera), at, camera);

describe("L2 year markers (career-year-markers)", () => {
  const career = buildCareerRoad(careerLayoutInput(l4Data.career));
  const markers = yearMarkerSigns(career.years, FLOOR_COLOR.L2);
  const spawn = realLayouts().L2.spawn;
  /** `FloatingSigns` opacity with the rover at `x` (no placement on L2): the fade along the road. */
  const shown = (s: SignSpec, x: number) => (s.fadeX === undefined ? 1 : labelFade(s.fadeX - x)) > SIGN_HIDDEN;

  it("show at the /journey arrival and face the camera from any side of the rover", () => {
    const visible = markers.filter((s) => shown(s, spawn.x));
    expect(visible.length, `year markers shown from the arrival at x ${spawn.x}`).toBeGreaterThanOrEqual(1);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 2 * Math.PI;
      const camera = { x: spawn.x + Math.sin(a) * 20, z: spawn.z + Math.cos(a) * 20 };
      for (const s of visible) expect(facing(s, camera), `${s.text} from camera direction ${a.toFixed(2)}`).toBeGreaterThan(0.98);
    }
  });
});

describe("L4 timeline signs (library-signs)", () => {
  const zones: Record<LibraryZone, string> = { blog: en.library.posts, research: en.library.research, models: en.library.publications, talks: en.library.talks };
  const featured = l4Layout.stations[0]?.zone === "blog" ? l4Layout.stations[0] : undefined;
  const { signs, meta } = librarySigns({ layout: l4Layout, zones, titles: stationTitles(l4Data.library, zones), titled: l4Layout.stations.filter((s) => s !== featured) });
  const half = libraryPlateHalves(signs);

  it.each([
    { id: "desktop", size: { width: 1280, height: 720 } },
    { id: "phone", size: { width: 390, height: 844 } },
  ])("show mid-timeline and face the camera from the default view and turned views ($id)", ({ size }) => {
    const drive = new L4Drive(size);
    // The rendered check ran mid-timeline: the arrival frames no sign since the section signs hang over the back of each zone's first desk.
    drive.to({ x: 24, z: 0 });
    const home = drive.orbit.yaw;
    for (const turn of [0, 1, -1, 2, -2, 3, -3, 4]) {
      rotate(drive.orbit, home + turn * ROTATE_STEP - drive.orbit.yaw);
      stepOrbit(drive.orbit, 1, true);
      const camera = drive.camera();
      const work = createLibraryFrame();
      const { shown } = libraryLabelFrame(work, { camera, signs, meta, half, origin: { x: 0, y: L4_FLOOR_Y, z: 0 }, rover: drive.pos, rooms: undefined, size: drive.size, endBoxes: [], v: new Vector3() });
      const visible = signs.filter((_, i) => shown[i]);
      expect(visible.length, `L4 signs shown, camera turned ${turn} steps`).toBeGreaterThanOrEqual(1);
      const eye = { x: camera.position.x, z: camera.position.z };
      for (const s of visible) expect(facing(s, eye), `${s.text}, camera turned ${turn} steps`).toBeGreaterThan(0.98);
    }
  });
});
