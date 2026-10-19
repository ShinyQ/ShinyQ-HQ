import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { ARRIVAL_HEADING } from "@/experience/camera/arrival";
import { cameraWorld, clampCamera } from "@/experience/camera/collision";
import { CAMERA_FAR, CAMERA_NEAR } from "@/experience/camera/firstPerson";
import { followOffsetScale } from "@/experience/camera/offset";
import { activeZone, createOrbitState, primeZone, setPitchRange, stepOrbit, updateZone, zoneAt, type OrbitState } from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followForward, followPose, pitchRange } from "@/experience/camera/rigs";
import { buildFloorLayouts, floorY, ROVER } from "@/experience/config";
import { stationTitles } from "@/experience/floors/library/decor/common";
import { endPlazaSigns, PEDESTAL_OBSTACLE, type EndPlazaLabels } from "@/experience/floors/library/decor/EndPlaza";
import { createLibraryFrame, endPlazaFrame, vaultZone, libraryLabelFrame, libraryPlateHalves } from "@/experience/floors/library/decor/signFrame";
import { librarySigns } from "@/experience/floors/library/decor/signs";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { libraryLayoutInput, type LibraryZone } from "@/experience/floors/library/model";
import { orbSlots } from "@/experience/floors/library/topics";
import { polygonArea, polygonOverlap, type Quad } from "@/experience/fx/labelPlacement";
import { signPlate } from "@/experience/fx/signLayout";
import { buildNavGrid } from "@/experience/nav/navgrid";
import { buildRoadGraph } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import type { Vec2, ViewportClass } from "@/experience/types";
import { formatYearMonth } from "@/lib/format";
import { cameraClass } from "@/lib/viewport";
import en from "../../messages/en.json";

/**
 * The L4 timeline label sweep without a renderer (owner request 2026-10-18; the rendered version is
 * `e2e/library-labels.spec.ts`). The real L4 layout and signs, the follow camera as `CameraDirector` settles it
 * (view zones along the driven route, look-ahead, offset scale, camera collision) and the scene's own per-frame
 * placement (`signFrame.ts`), on a desktop and a phone, at the rendered sweep's poses. Each pose is checked at
 * several orbit angles of the end plaza's topic labels: no two shown plates overlap, no timeline plate covers
 * the rover, titles stay within the cap and no text shows twice; a post title shows along the posts and each
 * zone's sign shows on the approach, road or door pose of its zone.
 */

const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const data = buildExperienceData("en", FLOOR_NAMES);
const input = libraryLayoutInput(data.library);
const layout = buildLibraryLayout(input);
const floor = buildFloorLayouts(data.years.length, { library: input }).L4;
const net = floor.road!;
const grid = buildNavGrid(floor, ROVER.radius);
const graph = buildRoadGraph(net);
const world = cameraWorld(floor, floorY("L4"));
const FLOOR_Y = floorY("L4");

// The timeline signs as `NewsroomDecor` builds them: the featured stage carries its title on the headline wall.
const zones: Record<LibraryZone, string> = { blog: en.library.posts, research: en.library.research, models: en.library.publications, talks: en.library.talks };
const featured = layout.stations[0]?.zone === "blog" ? layout.stations[0] : undefined;
const timeline = librarySigns({ layout, zones, titles: stationTitles(data.library, zones), titled: layout.stations.filter((s) => s !== featured) });
const half = libraryPlateHalves(timeline.signs);
const texts = timeline.signs.map((s) => s.text.replace(/\s+/g, " "));

// The end plaza signs as `Experience.tsx` labels them (no topic picked).
const metrics = data.library.researchMetrics;
const M = en.library.topics.monument;
const endLabels: EndPlazaLabels = {
  pieces: (count, topic) => `${count} pieces on ${topic}`,
  monument: metrics
    ? {
        citations: String(metrics.citations),
        citationsLabel: M.citations,
        hIndex: String(metrics.hIndex),
        hIndexLabel: M.hIndex,
        source: M.asOf.replace("{source}", metrics.source).replace("{date}", formatYearMonth(metrics.asOf, "en")),
      }
    : null,
  archive: en.hud.interact.archive,
  vault: en.hud.interact.studyVault,
};
const plaza = endPlazaSigns(layout, data.library.topics, orbSlots(data.library.topics), endLabels, null);
const plazaSizes = plaza.signs.map(signPlate);
const plazaTexts = plaza.signs.map((s) => s.text.replace(/\s+/g, " "));
const plazaOrigin = { x: layout.end!.center.x, y: FLOOR_Y, z: layout.end!.center.z };

/** End plaza orbit angles each pose is checked at (the topic labels ride the orbit). */
const ANGLES = Array.from({ length: 8 }, (_, i) => (i * 2 * Math.PI) / 8);
/** Zone sign texts and rooms, as the rendered sweep reads them. */
const ZONE_SIGN = { research: en.library.research.toUpperCase(), models: en.library.publications.toUpperCase(), talks: en.library.talks.toUpperCase() } as const;
const ZONE_ROOM = { research: "L4:research", models: "L4:publications", talks: "L4:talks" } as const;
const TIMELINE_KINDS = new Set(["section", "title", "year"]);

interface Plate {
  text: string;
  kind: string;
  quad: Quad;
}

/** Overlap of two quads as a share of the smaller one; 0 when the smaller is at most 1 px squared. */
function overlapShare(a: Quad, b: Quad) {
  const min = Math.min(polygonArea(a), polygonArea(b));
  return min <= 1 ? 0 : polygonOverlap(a, b) / min;
}

/** The rendered sweep's audit: overlapping pairs, timeline plates on the rover, titles over the cap, texts shown twice. */
function audit(plates: readonly Plate[], titleCap: number, rover: Quad | null) {
  const hits: string[] = [];
  for (let i = 0; i < plates.length; i++)
    for (let j = i + 1; j < plates.length; j++) {
      const share = overlapShare(plates[i].quad, plates[j].quad);
      if (share > 0.02) hits.push(`${plates[i].text} x ${plates[j].text} (${(share * 100).toFixed(1)}%)`);
    }
  const onRover = rover ? plates.filter((p) => TIMELINE_KINDS.has(p.kind) && overlapShare(p.quad, rover) > 0.02).map((p) => p.text) : [];
  const titles = plates.filter((p) => p.kind === "title").length;
  const seen = new Set<string>();
  const twice = plates.filter((p) => (seen.has(p.text) ? true : (seen.add(p.text), false))).map((p) => p.text);
  return { hits, onRover, overCap: Math.max(0, titles - titleCap), twice };
}

/** The rover and the follow camera, driven like the rendered sweep (`driveTo`) and settled like `CameraDirector`. */
class Drive {
  readonly orbit: OrbitState = createOrbitState();
  readonly cls: ViewportClass;
  pos: Vec2 & { heading: number };

  constructor(readonly size: { width: number; height: number }) {
    this.cls = cameraClass(size.width, size.height);
    setPitchRange(this.orbit, pitchRange(this.cls, "follow"));
    // A deep link spawns on the arrival point heading east and opens on the arrival view.
    this.pos = { ...floor.spawn, heading: ARRIVAL_HEADING };
    primeZone(this.orbit, zoneAt("L4", this.pos, floor.viewZones), this.cls);
  }

  /** Drives the autopilot route to `to` in small steps, tracking the view zones on the way, then lets the camera settle. */
  to(to: Vec2) {
    const route = roadRoute(net, grid, this.pos, to, graph) ?? [to];
    for (const p of route) {
      const dx = p.x - this.pos.x;
      const dz = p.z - this.pos.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const heading = Math.atan2(dx, dz);
      const from = { ...this.pos };
      const steps = Math.ceil(len / 0.25);
      for (let k = 1; k <= steps; k++) {
        this.pos = { x: from.x + (dx * k) / steps, z: from.z + (dz * k) / steps, heading };
        updateZone(this.orbit, activeZone(zoneAt("L4", this.pos, floor.viewZones), this.orbit), false, this.cls);
        stepOrbit(this.orbit, 0.25 / ROVER.autopilotSpeed, false);
      }
    }
    stepOrbit(this.orbit, 1, true);
  }

  /** The settled follow camera (look-ahead along the view, offset scale, camera collision). */
  camera(): PerspectiveCamera {
    const { width, height } = this.size;
    const roverTarget: [number, number, number] = [this.pos.x, FLOOR_Y + 1, this.pos.z];
    const f = followForward(this.cls, this.orbit.yaw);
    const ahead = FOLLOW_LOOK_AHEAD[this.cls];
    const pose = followPose(this.cls, [roverTarget[0] + f.x * ahead, roverTarget[1], roverTarget[2] + f.z * ahead], this.orbit.yaw, this.orbit.zoom * followOffsetScale(this.cls, width / height), this.orbit.pitch);
    const position = clampCamera(pose.target, pose.position, world, roverTarget, pose.fov);
    const camera = new PerspectiveCamera(pose.fov, width / height, CAMERA_NEAR, CAMERA_FAR);
    camera.position.set(...position);
    camera.lookAt(...pose.target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    return camera;
  }
}

/** Shown plates (timeline and end plaza) and the rover's screen quad for one frame at end plaza orbit angle `angle`. */
function frame(drive: Drive, camera: PerspectiveCamera, angle: number) {
  const v = new Vector3();
  const end = endPlazaFrame({ camera, signs: plaza.signs, sizes: plazaSizes, meta: plaza.meta, origin: plazaOrigin, angle, hovered: null, obstacles: PEDESTAL_OBSTACLE, size: drive.size, v, vault: vaultZone(drive.pos, layout.end!.vault) });
  const work = createLibraryFrame();
  const lib = libraryLabelFrame(work, { camera, signs: timeline.signs, meta: timeline.meta, half, origin: { x: 0, y: FLOOR_Y, z: 0 }, rover: drive.pos, rooms: undefined, size: drive.size, endBoxes: end.boxes, v });
  const plates: Plate[] = [];
  timeline.signs.forEach((_, i) => {
    const quad = work.quads[i];
    if (lib.shown[i] && quad) plates.push({ text: texts[i], kind: timeline.meta[i].kind, quad });
  });
  plaza.signs.forEach((_, i) => {
    if (end.shown[i] && end.candidates[i].box) plates.push({ text: plazaTexts[i], kind: plaza.meta[i].kind, quad: end.quads[i] });
  });
  const r = lib.rover;
  const rover: Quad | null = r ? [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]] : null;
  return { plates, rover };
}

const DEVICES = [
  { id: "desktop", titleCap: 6, size: { width: 1440, height: 900 } },
  { id: "phone", titleCap: 4, size: { width: 390, height: 844 } },
] as const;

describe.each(DEVICES)("L4 timeline labels ($id)", ({ id, titleCap, size }) => {
  it("never overlap, stay within the title cap and show each zone's sign", () => {
    const drive = new Drive(size);
    const visited: string[] = [];
    /** Audits every orbit angle at the current pose; returns the plates shown at each angle (in `ANGLES` order). */
    const checkAngles = (pose: string) => {
      visited.push(pose);
      const camera = drive.camera();
      return ANGLES.map((angle) => {
        const { plates, rover } = frame(drive, camera, angle);
        expect(audit(plates, titleCap, rover), `${id} ${pose} at orbit ${angle.toFixed(2)}`).toEqual({ hits: [], onRover: [], overCap: 0, twice: [] });
        return plates;
      });
    };
    /** Every plate shown at any orbit angle of the current pose. */
    const check = (pose: string) => checkAngles(pose).flat();

    check("approach");
    drive.to({ x: 8, z: 0 });
    const posts = check("posts");
    drive.to({ x: 24, z: 0 });
    const mid = check("mid");
    expect([...posts, ...mid].some((p) => p.kind === "title"), `${id}: a post title at posts or mid`).toBe(true);

    const spurs = net.spurs;
    for (const zone of ["research", "models", "talks"] as const) {
      const spur = spurs.find((s) => s.room === ZONE_ROOM[zone])!;
      expect(spur, `${id}: ${zone} spur`).toBeDefined();
      const len = Math.hypot(spur.to.x - spur.from.x, spur.to.z - spur.from.z);
      const k = Math.max(0, (len - 2) / len);
      const poses = [
        { pose: `${zone}-approach`, at: { x: spur.from.x - 6, z: 0 } },
        { pose: zone, at: spur.from },
        { pose: `${zone}-door`, at: { x: spur.from.x + (spur.to.x - spur.from.x) * k, z: spur.from.z + (spur.to.z - spur.from.z) * k } },
      ];
      let seen = false;
      for (const { pose, at } of poses) {
        drive.to(at);
        seen = check(pose).some((p) => p.kind === "section" && p.text === ZONE_SIGN[zone]);
        if (seen) break;
      }
      expect(seen, `${id}: ${ZONE_SIGN[zone]} sign on the approach, road or door pose of the ${zone} zone (${visited.join(", ")})`).toBe(true);
    }

    // The Study Vault: from its stop every book's spine and the "Study Vault" sign show at every orbit angle (they
    // outrank the topics there, so the orbiting topic labels never push one off).
    const vault = layout.end!.vault!;
    drive.to(floor.stops!["L4:vault"]!);
    const sign = en.hud.interact.studyVault.toUpperCase();
    expect(vault.books.length, `${id}: vault books`).toBeGreaterThan(0);
    checkAngles("vault").forEach((atVault, i) => {
      const at = `${id} vault at orbit ${ANGLES[i].toFixed(2)}`;
      expect(vault.books.filter((book) => !atVault.some((p) => p.kind === "guide" && p.text === book.spine)).map((b) => b.spine), `${at}: spines not shown`).toEqual([]);
      expect(atVault.some((p) => p.kind === "vault" && p.text === sign), `${at}: the Study Vault sign`).toBe(true);
    });
  });
});

describe("the sweep's audit", () => {
  const plate = (text: string, kind: string, x: number): Plate => ({ text, kind, quad: [[x, 0], [x + 100, 0], [x + 100, 30], [x, 30]] });

  it("reports overlaps, plates on the rover, titles over the cap and repeated texts", () => {
    const plates = [plate("A", "title", 0), plate("B", "title", 50), plate("A", "year", 300)];
    const rover: Quad = [[310, 0], [330, 0], [330, 20], [310, 20]];
    expect(audit(plates, 1, rover)).toEqual({ hits: ["A x B (50.0%)"], onRover: ["A"], overCap: 1, twice: ["A"] });
  });

  it("shows plates on the real floor (the sweep is not vacuous)", () => {
    const drive = new Drive({ width: 1440, height: 900 });
    drive.to({ x: 8, z: 0 });
    const { plates } = frame(drive, drive.camera(), 0);
    expect(plates.length).toBeGreaterThan(2);
  });
});
