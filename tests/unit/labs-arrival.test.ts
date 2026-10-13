import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { zoneAt } from "@/experience/camera/orbit";
import { followOffsetScale } from "@/experience/camera/offset";
import { FOLLOW_LOOK_AHEAD, followPose } from "@/experience/camera/rigs";
import { LIST_STYLE, PANEL } from "@/experience/floors/labs/directory";
import { buildLabsLayout, directoryBoard, LABS } from "@/experience/floors/labs/layout";
import type { Vec2 } from "@/experience/types";
import { cameraClass } from "@/lib/viewport";

const pods = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" }).labs.pods;
const { floor } = buildLabsLayout(pods);
const WINGS = ["software", "ai"] as const;
/** Camera west of the rover, looking east along the floor. */
const LOOK_EAST = (-3 * Math.PI) / 4;

type Safe = { top: number; bottom: number; side: number };
/** The owner's review sizes and the HUD-free box of each (`DESKTOP_SAFE`, `PHONE_SAFE` in e2e/hq.ts). */
const VIEWPORTS: readonly { w: number; h: number; safe: Safe }[] = [
  { w: 1440, h: 900, safe: { top: 90, bottom: 90, side: 40 } },
  { w: 2560, h: 1440, safe: { top: 90, bottom: 90, side: 40 } },
  { w: 390, h: 844, safe: { top: 120, bottom: 140, side: 24 } },
];

/**
 * The follow camera the Director settles on with the rover at `at` inside an east-looking view zone
 * (CameraDirector: it aims FOLLOW_LOOK_AHEAD ahead along its forward, +x here, and scales the offset by aspect).
 */
function settledCamera(w: number, h: number, at: Vec2) {
  const zone = zoneAt("L3", at, floor.viewZones);
  if (!zone) throw new Error(`no view zone at ${at.x}, ${at.z}`);
  const cls = cameraClass(w, h);
  const pose = followPose(cls, [at.x + FOLLOW_LOOK_AHEAD[cls], 1, at.z], zone.yaw, (zone.zoom ?? 1) * followOffsetScale(cls, w / h));
  const camera = new PerspectiveCamera(pose.fov, w / h, 0.1, 500);
  camera.position.set(...pose.position);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return { camera, zone };
}

function screen(camera: PerspectiveCamera, w: number, h: number, x: number, y: number, z: number) {
  const v = new Vector3(x, y, z).project(camera);
  return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
}

/** A panel's west face on screen (CSS px), and its vertical scale (px per u) between `y` and `y + 1`. */
function westFace(camera: PerspectiveCamera, w: number, h: number, wing: (typeof WINGS)[number]) {
  const b = directoryBoard(wing);
  const corners = [b.minZ, b.maxZ].flatMap((z) => [0, LABS.board.h].map((y) => screen(camera, w, h, b.minX, y, z)));
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    maxX: Math.max(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxY: Math.max(...corners.map((c) => c.y)),
    scale: (y: number) => Math.abs(screen(camera, w, h, b.minX, y, b.center.z).y - screen(camera, w, h, b.minX, y + 1, b.center.z).y),
  };
}

function expectInside(face: ReturnType<typeof westFace>, w: number, h: number, safe: Safe, label: string) {
  expect(face.minX, label).toBeGreaterThanOrEqual(safe.side);
  expect(face.maxX, label).toBeLessThanOrEqual(w - safe.side);
  expect(face.minY, label).toBeGreaterThanOrEqual(safe.top);
  expect(face.maxY, label).toBeLessThanOrEqual(h - safe.bottom);
}

describe("L3 arrival frames the wing directory wall (owner request 2026-10-13)", () => {
  for (const { w, h, safe } of VIEWPORTS) {
    it(`shows both panels whole and clear of the HUD on arrival at ${w}x${h}`, () => {
      const { camera, zone } = settledCamera(w, h, LABS.overview);
      expect(zone.id).toBe("L3:overview");
      expect(zone.yaw).toBeCloseTo(LOOK_EAST);
      for (const wing of WINGS) expectInside(westFace(camera, w, h, wing), w, h, safe, `${wing} arrival ${w}x${h}`);
    });

    it(`fits the whole panel under the HUD from its stop at ${w}x${h}`, () => {
      for (const wing of WINGS) {
        const { camera, zone } = settledCamera(w, h, directoryBoard(wing).stop);
        expect(zone.id).toBe(`L3:directory:${wing}`);
        expect(zone.yaw).toBeCloseTo(LOOK_EAST);
        expectInside(westFace(camera, w, h, wing), w, h, safe, `${wing} stop ${w}x${h}`);
      }
    });
  }
});

describe("L3 directory wall legibility (owner request 2026-10-13)", () => {
  // Em size in px of a text of `size` u at height `y` on the panel's west face.
  const em = (w: number, h: number, at: Vec2, wing: (typeof WINGS)[number], y: number, size: number) =>
    westFace(settledCamera(w, h, at).camera, w, h, wing).scale(y) * size;
  // The lowest list line is the most foreshortened one.
  const LIST_Y = 1.5;
  const TITLE_Y = LABS.board.h - 2;

  it("reads the wing titles on arrival: at least 12 px on a phone and 20 px on a laptop", () => {
    for (const wing of WINGS) {
      expect(em(390, 844, LABS.overview, wing, TITLE_Y, PANEL.title.size), wing).toBeGreaterThanOrEqual(12);
      expect(em(1440, 900, LABS.overview, wing, TITLE_Y, PANEL.title.size), wing).toBeGreaterThanOrEqual(20);
    }
  });

  it("reads the top projects on arrival on a laptop and a big monitor, and from the panel's stop on a phone", () => {
    for (const wing of WINGS) {
      expect(em(1440, 900, LABS.overview, wing, LIST_Y, PANEL.list.size), wing).toBeGreaterThanOrEqual(11.5);
      expect(em(2560, 1440, LABS.overview, wing, LIST_Y, PANEL.list.size), wing).toBeGreaterThanOrEqual(18);
      expect(em(390, 844, directoryBoard(wing).stop, wing, LIST_Y, PANEL.list.size), wing).toBeGreaterThanOrEqual(10);
    }
  });

  it("reads the phone's top three larger than the desktop list would, on arrival and from the panel's stop", () => {
    for (const wing of WINGS) {
      const arrival = em(390, 844, LABS.overview, wing, LIST_Y, LIST_STYLE.compact.size);
      const stop = em(390, 844, directoryBoard(wing).stop, wing, LIST_Y, LIST_STYLE.compact.size);
      expect(arrival, wing).toBeGreaterThan(em(390, 844, LABS.overview, wing, LIST_Y, PANEL.list.size) * 1.2);
      expect(stop, wing).toBeGreaterThanOrEqual(12);
    }
  });
});
