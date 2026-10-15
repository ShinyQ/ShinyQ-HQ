import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { projectPlate } from "@/experience/fx/plateProjection";

const size = { width: 1000, height: 500 };

function camera() {
  const cam = new PerspectiveCamera(60, size.width / size.height, 0.1, 200);
  cam.position.set(0, 0, 0);
  cam.lookAt(0, 0, -1);
  cam.updateMatrixWorld();
  return cam;
}

describe("projectPlate", () => {
  it("projects a plate in front of the camera to a centered box with four corners", () => {
    const cam = camera();
    const v = new Vector3();
    const small = projectPlate(cam, { x: 0, y: 0, z: -10 }, { w: 1, h: 0.5 }, size, v);
    const wide = projectPlate(cam, { x: 0, y: 0, z: -10 }, { w: 2, h: 0.5 }, size, v);
    expect(small).not.toBeNull();
    expect(wide).not.toBeNull();
    if (!small || !wide) return;
    expect(small.onScreen).toBe(true);
    expect(small.quad).toHaveLength(4);
    expect((small.box.x0 + small.box.x1) / 2).toBeCloseTo(size.width / 2, 5);
    expect((small.box.y0 + small.box.y1) / 2).toBeCloseTo(size.height / 2, 5);
    expect(small.box.x1 - small.box.x0).toBeGreaterThan(0);
    expect(wide.box.x1 - wide.box.x0).toBeCloseTo(2 * (small.box.x1 - small.box.x0), 5);
    // Corners in order: left bottom, right bottom, right top, left top.
    const [lb, rb, rt, lt] = small.quad;
    expect(lb[0]).toBeLessThan(rb[0]);
    expect(lb[1]).toBeGreaterThan(lt[1]);
    expect(rt[0]).toBeCloseTo(rb[0], 5);
  });

  it("returns null for a plate behind the camera", () => {
    expect(projectPlate(camera(), { x: 0, y: 0, z: 10 }, { w: 1, h: 0.5 }, size, new Vector3())).toBeNull();
  });

  it("returns null when the camera stands right above the plate", () => {
    expect(projectPlate(camera(), { x: 0, y: -5, z: 0 }, { w: 1, h: 0.5 }, size, new Vector3())).toBeNull();
  });

  it("marks a plate far to the side as off screen", () => {
    const result = projectPlate(camera(), { x: 40, y: 0, z: -10 }, { w: 1, h: 0.5 }, size, new Vector3());
    expect(result).not.toBeNull();
    expect(result?.onScreen).toBe(false);
  });
});
