import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { zoneAt, zoneView } from "@/experience/camera/orbit";
import { followOffsetScale } from "@/experience/camera/offset";
import { FOLLOW_LOOK_AHEAD, followPose } from "@/experience/camera/rigs";
import { yawTowards } from "@/experience/fx/facing";
import { signPlate, type SignSpec } from "@/experience/fx/signLayout";
import { LIST_STYLE, PANEL, roadSigns } from "@/experience/floors/labs/directory";
import { buildLabsLayout, directoryBoard, directoryStop, LABS, LABS_WINGS } from "@/experience/floors/labs/layout";
import type { Wing } from "@/content/schema";
import type { Vec2 } from "@/experience/types";
import { cameraClass } from "@/lib/viewport";

const pods = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" }).labs.pods;
const layout = buildLabsLayout(pods);
const { floor } = layout;
const WING_NAMES: Record<Wing, string> = { software: "Product Engineering", ai: "AI Engineering", data: "Data and ML" };
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
  const pose = followPose(cls, [at.x + FOLLOW_LOOK_AHEAD[cls], 1, at.z], zone.yaw, (zoneView(zone, cls).zoom ?? 1) * followOffsetScale(cls, w / h));
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

/** A board's west face on screen (CSS px), and its vertical scale (px per u) between `y` and `y + 1`. */
function westFace(camera: PerspectiveCamera, w: number, h: number, wing: Wing) {
  const b = directoryBoard(wing);
  const corners = [b.minZ, b.maxZ].flatMap((z) => [LABS.board.base, LABS.board.h].map((y) => screen(camera, w, h, b.minX, y, z)));
  return {
    ...boxOf(corners),
    scale: (y: number) => Math.abs(screen(camera, w, h, b.minX, y, b.center.z).y - screen(camera, w, h, b.minX, y + 1, b.center.z).y),
  };
}

/** A floating sign's plate on screen: its four corners, turned square to the camera (yaw only) like `FloatingSigns`. */
function signBox(camera: PerspectiveCamera, w: number, h: number, spec: SignSpec): ScreenBox {
  const plate = signPlate(spec);
  const yaw = yawTowards({ x: spec.x, z: spec.z }, { x: camera.position.x, z: camera.position.z });
  const ux = (Math.cos(yaw) * plate.w) / 2;
  const uz = (-Math.sin(yaw) * plate.w) / 2;
  const corners = [-1, 1].flatMap((s) => [-1, 1].map((t) => screen(camera, w, h, spec.x + s * ux, spec.y + (t * plate.h) / 2, spec.z + s * uz)));
  return boxOf(corners);
}

/** Strict box intersection (touching edges do not count). */
const overlap = (a: ScreenBox, b: ScreenBox) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

function expectInside(face: ScreenBox, w: number, h: number, safe: Safe, label: string) {
  expect(face.minX, label).toBeGreaterThanOrEqual(safe.side);
  expect(face.maxX, label).toBeLessThanOrEqual(w - safe.side);
  expect(face.minY, label).toBeGreaterThanOrEqual(safe.top);
  expect(face.maxY, label).toBeLessThanOrEqual(h - safe.bottom);
}

describe("L3 arrival frames the wing directory wall (owner request 2026-10-13)", () => {
  for (const { w, h, safe } of VIEWPORTS) {
    it(`shows the three boards whole and clear of the HUD on arrival at ${w}x${h}`, () => {
      const { camera, zone } = settledCamera(w, h, LABS.overview);
      expect(zone.id).toBe("L3:overview");
      expect(zone.yaw).toBeCloseTo(LOOK_EAST);
      for (const wing of LABS_WINGS) expectInside(westFace(camera, w, h, wing), w, h, safe, `${wing} arrival ${w}x${h}`);
    });

    it(`fits the whole board under the HUD from its stop at ${w}x${h}`, () => {
      for (const wing of LABS_WINGS) {
        const { camera, zone } = settledCamera(w, h, directoryBoard(wing).stop);
        expect(zone.id).toBe(`L3:directory:${wing}`);
        expect(zone.yaw).toBeCloseTo(LOOK_EAST);
        expectInside(westFace(camera, w, h, wing), w, h, safe, `${wing} stop ${w}x${h}`);
        const board = westFace(camera, w, h, wing);
        for (const spec of roadSigns(layout, WING_NAMES, "mono")) expect(overlap(signBox(camera, w, h, spec), board), `${spec.text} over ${wing} from its stop`).toBe(false);
      }
    });

    it(`shows the three road signs and their mouths at ${w}x${h}, no sign over a board`, () => {
      const { camera } = settledCamera(w, h, LABS.overview);
      const boards = LABS_WINGS.map((wing) => westFace(camera, w, h, wing));
      for (const spec of roadSigns(layout, WING_NAMES, "mono")) {
        const box = signBox(camera, w, h, spec);
        expect(box.minX, spec.text).toBeGreaterThanOrEqual(0);
        expect(box.maxX, spec.text).toBeLessThanOrEqual(w);
        expect(box.minY, spec.text).toBeGreaterThanOrEqual(safe.top);
        expect(box.maxY, spec.text).toBeLessThanOrEqual(h - safe.bottom);
        for (const b of boards) expect(overlap(box, b), spec.text).toBe(false);
      }
      for (const road of ["software", "ai", "data"] as const) {
        const p = road === "data" ? { x: layout.hub.center.x + LABS.hub.size / 2, z: 0 } : layout.network.roads.find((r) => r.id === road)!.points[1];
        const s = screen(camera, w, h, p.x, 0, p.z);
        expect(s.x, road).toBeGreaterThanOrEqual(safe.side);
        expect(s.x, road).toBeLessThanOrEqual(w - safe.side);
        expect(s.y, road).toBeLessThanOrEqual(h - safe.bottom);
      }
    });
  }
});

describe("L3 directory wall legibility (owner request 2026-10-13, sizes Round 7)", () => {
  // Em size in px of a text of `size` u at height `y` on the board's west face.
  const em = (w: number, h: number, at: Vec2, wing: Wing, y: number, size: number) => westFace(settledCamera(w, h, at).camera, w, h, wing).scale(y) * size;
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
      expect(em(390, 844, directoryStop(wing), wing, LIST_Y, PANEL.list.size), wing).toBeGreaterThanOrEqual(8);
      expect(em(390, 844, directoryStop(wing), wing, LIST_Y, LIST_STYLE.compact.size), wing).toBeGreaterThanOrEqual(9.6);
    }
  });
});
