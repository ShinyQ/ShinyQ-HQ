import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { LOBBY } from "@/experience/config";
import { OFFICE, officeSlots, rowSlots } from "@/experience/floors/lobby/officeLayout";
import { OFFICE_STATES } from "@/lib/office/protocol";
import { cameraClass } from "@/lib/viewport";
import type { ViewportClass } from "@/experience/types";
import { followCamera, SIZES } from "../helpers/office-cameras";
import { backRowVisibility, everyRoverInFrame } from "../helpers/office-rows";

/**
 * The second, raised console row from the office stop (owner decision 2026-10-21, design 5.10): every back-row Rover's
 * face and desk screen at least 80% unoccluded by the front row on the desktop and tablet camera classes; on portrait
 * screens every Rover (both rows) in frame and the back row at least 60% unoccluded. Measured from the settled follow
 * camera at the stop in the `L1:office` view zone (`OFFICE.view`, per class) and at the desktop near pose, against the front row
 * in every state's still pose (a raised flag included). A retuned `OFFICE.view` or `OFFICE.rows` reruns it unchanged.
 */
const W = LOBBY.officeWing;
const slots = officeSlots(W);
const MIN: Record<ViewportClass, number> = { desktop: 0.8, tablet: 0.8, mobile: 0.6 };

describe("the back console row seen from the office stop", () => {
  it("stands behind the front row, raised, one Rover per seat (slots 5 to 9)", () => {
    const [front, back] = [rowSlots(slots, 0), rowSlots(slots, 1)];
    expect(back.map((s) => s.slot)).toEqual([5, 6, 7, 8, 9]);
    expect(back.every((s) => s.lift === OFFICE.rows[1].lift && s.lift > 0)).toBe(true);
    for (const s of back) expect(Math.min(...front.map((f) => Math.hypot(f.rover.x - W.stop.x, f.rover.z - W.stop.z)))).toBeLessThan(Math.hypot(s.rover.x - W.stop.x, s.rover.z - W.stop.z));
  });

  it("measures real occlusion: from a camera low behind the stop the front row hides more of the back row than the gate allows", () => {
    const camera = new PerspectiveCamera(40, 1.6, 0.1, 500);
    camera.position.set(W.stop.x, 1, W.stop.z - 6);
    camera.lookAt(W.stop.x, 1.5, W.arc.z + 15);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const low = backRowVisibility(camera, { width: 1600, height: 1000 });
    expect(Math.min(...low.flatMap((v) => [v.face, v.screen]))).toBeLessThan(MIN.desktop);
  });

  describe.each(SIZES)("$id ($width x $height)", ({ width, height }) => {
    const cls = cameraClass(width, height);
    const size = { width, height };
    const poses = cls === "desktop" ? [0, 1] : [0];

    it.each(poses)(`keeps every back-row face and desk screen ${MIN[cls] * 100}% or more in sight past the front row (%i zoom steps), in every state's still pose`, (steps) => {
      const camera = followCamera(width, height, W.stop, steps);
      for (const state of OFFICE_STATES)
        for (const v of backRowVisibility(camera, size, state)) {
          expect(v.face, `${state}: face ${v.slot + 1}`).toBeGreaterThanOrEqual(MIN[cls]);
          expect(v.screen, `${state}: desk screen ${v.slot + 1}`).toBeGreaterThanOrEqual(MIN[cls]);
        }
    });

    if (cls === "mobile")
      it("frames every Rover of both rows from the stop", () => {
        expect(everyRoverInFrame(followCamera(width, height, W.stop), size)).toBe(true);
      });
  });
});
