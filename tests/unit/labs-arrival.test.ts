import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { zoneAt, zoneView } from "@/experience/camera/orbit";
import { followOffsetScale } from "@/experience/camera/offset";
import { FOLLOW_LOOK_AHEAD, followForward, followPose } from "@/experience/camera/rigs";
import { LIST_STYLE, PANEL } from "@/experience/floors/labs/directory";
import { buildLabsLayout, directoryBoard, directoryStop, LABS, LABS_WINGS } from "@/experience/floors/labs/layout";
import type { Wing } from "@/content/schema";
import type { Vec2 } from "@/experience/types";
import { cameraClass } from "@/lib/viewport";

const pods = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" }).labs.pods;
const layout = buildLabsLayout(pods);
const { floor } = layout;
/** Camera west of the rover, looking east along the floor. */
const LOOK_EAST = (-3 * Math.PI) / 4;
/** Left to right on screen from the arrival camera. */
const SCREEN_ORDER: readonly Wing[] = ["software", "data", "ai"];

type Safe = { top: number; bottom: number; side: number };
/** The owner's review sizes and the HUD-free box of each (`DESKTOP_SAFE`, `PHONE_SAFE` in e2e/hq.ts). */
const VIEWPORTS: readonly { w: number; h: number; safe: Safe }[] = [
  { w: 1440, h: 900, safe: { top: 90, bottom: 90, side: 40 } },
  { w: 2560, h: 1440, safe: { top: 90, bottom: 90, side: 40 } },
  { w: 390, h: 844, safe: { top: 120, bottom: 140, side: 24 } },
];

/**
 * The follow camera the Director settles on with the rover at `at` inside a view zone
 * (CameraDirector: it aims FOLLOW_LOOK_AHEAD ahead along its forward and scales the offset by aspect).
 */
function settledCamera(w: number, h: number, at: Vec2) {
  const zone = zoneAt("L3", at, floor.viewZones);
  if (!zone) throw new Error(`no view zone at ${at.x}, ${at.z}`);
  const cls = cameraClass(w, h);
  const forward = followForward(cls, zone.yaw);
  const ahead = FOLLOW_LOOK_AHEAD[cls];
  const pose = followPose(cls, [at.x + forward.x * ahead, 1, at.z + forward.z * ahead], zone.yaw, (zoneView(zone, cls).zoom ?? 1) * followOffsetScale(cls, w / h));
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

type ScreenBox = { minX: number; maxX: number; minY: number; maxY: number };

function boxOf(points: readonly { x: number; y: number }[]): ScreenBox {
  return {
    minX: Math.min(...points.map((c) => c.x)),
    maxX: Math.max(...points.map((c) => c.x)),
    minY: Math.min(...points.map((c) => c.y)),
    maxY: Math.max(...points.map((c) => c.y)),
  };
}

/** A board's front face on screen (CSS px), and its vertical scale (px per u) at the face center between `y` and `y + 1`. */
function frontFace(camera: PerspectiveCamera, w: number, h: number, wing: Wing) {
  const b = directoryBoard(wing);
  const face = { x: b.center.x + (b.normal.x * LABS.board.w) / 2, z: b.center.z + (b.normal.z * LABS.board.w) / 2 };
  const corners = [-1, 1].flatMap((s) =>
    [LABS.board.base, LABS.board.h].map((y) => screen(camera, w, h, face.x + (s * b.along.x * LABS.board.width) / 2, y, face.z + (s * b.along.z * LABS.board.width) / 2)),
  );
  return {
    ...boxOf(corners),
    scale: (y: number) => Math.abs(screen(camera, w, h, face.x, y, face.z).y - screen(camera, w, h, face.x, y + 1, face.z).y),
  };
}

/** Share of a screen box's width inside 0..w. */
const onScreenShare = (box: ScreenBox, w: number) => (Math.min(box.maxX, w) - Math.max(box.minX, 0)) / (box.maxX - box.minX);

function expectInside(face: ScreenBox, w: number, h: number, safe: Safe, label: string) {
  expect(face.minX, label).toBeGreaterThanOrEqual(safe.side);
  expect(face.maxX, label).toBeLessThanOrEqual(w - safe.side);
  expect(face.minY, label).toBeGreaterThanOrEqual(safe.top);
  expect(face.maxY, label).toBeLessThanOrEqual(h - safe.bottom);
}

/** Smallest on-screen gap (px) a desktop arrival keeps between neighbouring boards. */
const MIN_GAP: Record<number, number> = { 1440: 40, 2560: 60 };

describe("L3 arrival frames the three directory boards (owner request 2026-10-16)", () => {
  for (const { w, h, safe } of VIEWPORTS) {
    const phone = cameraClass(w, h) === "mobile";
    it(phone ? `frames the Data and ML board whole and the inner part of each side board on arrival at ${w}x${h}` : `shows the three boards whole, apart and clear of the HUD on arrival at ${w}x${h}`, () => {
      const { camera, zone } = settledCamera(w, h, LABS.overview);
      expect(zone.id).toBe("L3:overview");
      expect(zone.yaw).toBeCloseTo(LOOK_EAST);
      if (!phone) {
        const faces = SCREEN_ORDER.map((wing) => frontFace(camera, w, h, wing));
        SCREEN_ORDER.forEach((wing, i) => expectInside(faces[i], w, h, safe, `${wing} arrival ${w}x${h}`));
        for (let i = 1; i < faces.length; i++) expect(faces[i].minX - faces[i - 1].maxX, `${SCREEN_ORDER[i - 1]} to ${SCREEN_ORDER[i]} at ${w}x${h}`).toBeGreaterThanOrEqual(MIN_GAP[w]);
        return;
      }
      // Phones (plan decision 2026-10-16): the camera has to stay east of the elevator shaft, so three separate
      // 9 u boards cannot all be whole; the Data and ML board is, and each side board shows its inner part.
      expectInside(frontFace(camera, w, h, "data"), w, h, safe, `data arrival ${w}x${h}`);
      for (const wing of ["software", "ai"] as const) expect(onScreenShare(frontFace(camera, w, h, wing), w), `${wing} on screen`).toBeGreaterThanOrEqual(0.35);
    });

    it(`fits the whole board under the HUD from its stop at ${w}x${h}`, () => {
      for (const wing of LABS_WINGS) {
        const { camera, zone } = settledCamera(w, h, directoryBoard(wing).stop);
        expect(zone.id).toBe(`L3:directory:${wing}`);
        expectInside(frontFace(camera, w, h, wing), w, h, safe, `${wing} stop ${w}x${h}`);
      }
    });

    it(`shows the three road mouths on arrival at ${w}x${h}`, () => {
      const { camera } = settledCamera(w, h, LABS.overview);
      for (const road of ["software", "ai", "data"] as const) {
        const p = road === "data" ? { x: layout.hub.center.x + LABS.hub.size / 2, z: 0 } : layout.network.roads.find((r) => r.id === road)!.points[1];
        const s = screen(camera, w, h, p.x, 0, p.z);
        const side = phone ? 0 : safe.side;
        expect(s.x, road).toBeGreaterThanOrEqual(side);
        expect(s.x, road).toBeLessThanOrEqual(w - side);
        expect(s.y, road).toBeGreaterThanOrEqual(0);
        expect(s.y, road).toBeLessThanOrEqual(h - safe.bottom);
      }
    });
  }
});

describe("L3 directory board legibility (owner request 2026-10-13, sizes Round 7)", () => {
  // Em size in px of a text of `size` u at height `y` on the board's front face.
  const em = (w: number, h: number, at: Vec2, wing: Wing, y: number, size: number) => frontFace(settledCamera(w, h, at).camera, w, h, wing).scale(y) * size;
  // The lowest list line is the most foreshortened one.
  const LIST_Y = LABS.board.base + 1.2;
  const TITLE_Y = LABS.board.h - 1.4;

  it("reads the board titles on arrival on a laptop", () => {
    for (const wing of LABS_WINGS) expect(em(1440, 900, LABS.overview, wing, TITLE_Y, PANEL.title.size), wing).toBeGreaterThanOrEqual(15);
  });

  it("reads the top projects on arrival on a laptop and a big monitor, and from the board's stop on a phone", () => {
    for (const wing of LABS_WINGS) {
      expect(em(1440, 900, LABS.overview, wing, LIST_Y, PANEL.list.size), wing).toBeGreaterThanOrEqual(9.2);
      expect(em(2560, 1440, LABS.overview, wing, LIST_Y, PANEL.list.size), wing).toBeGreaterThanOrEqual(14.4);
      expect(em(390, 844, directoryStop(wing), wing, LIST_Y, LIST_STYLE.compact.size), wing).toBeGreaterThanOrEqual(9.6);
    }
  });
});
