import { describe, expect, it } from "vitest";
import { getStats } from "@/content/load";
import { followOffsetScale } from "@/experience/camera/offset";
import { FOLLOW_LOOK_AHEAD, followPose, type CameraPose } from "@/experience/camera/rigs";
import { LOBBY } from "@/experience/config";
import { lobbyElements, TITLE_TOP } from "@/experience/floors/lobby/layout";
import { cameraClass } from "@/lib/viewport";

type V3 = [number, number, number];

/** Screen y (CSS px from the top) of a world point seen through a camera pose. */
function screenY(pose: CameraPose, p: V3, width: number, height: number): number {
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (v: V3): V3 => {
    const l = Math.hypot(...v);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const f = norm(sub(pose.target, pose.position));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(p, pose.position);
  const ndcY = dot(d, u) / dot(d, f) / Math.tan(((pose.fov / 2) * Math.PI) / 180);
  return ((1 - ndcY) / 2) * height;
}

/** The resting follow pose at the Lobby spawn, built like CameraDirector (look ahead along the default forward). */
function spawnPose(width: number, height: number): CameraPose {
  const cls = cameraClass(width, height);
  const ahead = FOLLOW_LOOK_AHEAD[cls] * Math.SQRT1_2;
  return followPose(cls, [LOBBY.spawn.x - ahead, 1, LOBBY.spawn.z - ahead], 0, followOffsetScale(cls, width / height));
}

describe("Lobby title", () => {
  it("clears the HUD top bar at 1440 x 900 (the bar ends at 76 px)", () => {
    const top = screenY(spawnPose(1440, 900), [LOBBY.hologram.x, TITLE_TOP, LOBBY.hologram.z], 1440, 900);
    expect(top).toBeGreaterThanOrEqual(80);
  });

  it("still floats above the stats tiles and the monogram", () => {
    const boxes = lobbyElements(getStats().length);
    const title = boxes.find((b) => b.name === "title")!;
    for (const b of boxes.filter((b) => b.name.startsWith("tile-") || b.name === "monogram")) {
      expect(title.min[1], b.name).toBeGreaterThan(b.max[1]);
    }
    expect(TITLE_TOP).toBeCloseTo(LOBBY.titleY + LOBBY.titleFont.name * 1.2);
  });
});
