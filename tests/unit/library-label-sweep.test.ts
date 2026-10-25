import { Vector3, type PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { stationTitles } from "@/experience/floors/library/decor/common";
import { endPlazaSigns, PEDESTAL_OBSTACLE } from "@/experience/floors/library/decor/EndPlaza";
import { createLibraryFrame, endPlazaFrame, vaultZone, libraryLabelFrame, libraryPlateHalves } from "@/experience/floors/library/decor/signFrame";
import { librarySigns } from "@/experience/floors/library/decor/signs";
import { roomOfPost, type LibraryBay, type LibrarySection } from "@/experience/floors/library/model";
import { LIBRARY_LABEL_MAX } from "@/experience/floors/library/signPlacement";
import { orbSlots } from "@/experience/floors/library/topics";
import { polygonArea, polygonOverlap, type Quad } from "@/experience/fx/labelPlacement";
import { signPlate } from "@/experience/fx/signLayout";
import type { Vec2 } from "@/experience/types";
import en from "../../messages/en.json";
import { L4_FLOOR_Y as FLOOR_Y, L4Drive as Drive, l4Data as data, l4EndLabels, l4Floor as floor, l4Layout as layout, l4Net as net } from "../helpers/l4-drive";

/**
 * The L4 timeline label sweep without a renderer (owner request 2026-10-18; the rendered version is
 * `e2e/library-labels.spec.ts`). The real L4 layout and signs, the follow camera as `CameraDirector` settles it
 * (view zones along the driven route, look-ahead, offset scale, camera collision) and the scene's own per-frame
 * placement (`signFrame.ts`), on a desktop and a phone, at the rendered sweep's poses: the arrival, each bay's stop
 * (with the spine nearest the stop live, as `TrackShelves` pulls it), mid-lane between bays and each desk. Each pose
 * is checked at several orbit angles of the end plaza's topic labels: no two shown plates overlap, no timeline plate
 * covers the rover, every kind stays within its cap and no text shows twice; each bay's track name and its live
 * spine's title show at its stop and each desk zone's sign shows on its approach, road or door pose.
 */

// The timeline signs as `NewsroomDecor` builds them: the featured stage carries its title on the headline wall.
const zones: Record<LibrarySection, string> = { blog: en.library.posts, research: en.library.research, models: en.library.publications, talks: en.library.talks };
const tracks = new Map(data.library.tracks.map((t) => [t.slug, t.label]));
const timeline = librarySigns({ layout, zones, titles: stationTitles(data.library, zones), tracks });
const half = libraryPlateHalves(timeline.signs);
const texts = timeline.signs.map((s) => s.text.replace(/\s+/g, " "));

// The end plaza signs as `Experience.tsx` labels them (no topic picked).
const plaza = endPlazaSigns(layout, data.library.topics, orbSlots(data.library.topics), l4EndLabels, null);
const plazaSizes = plaza.signs.map(signPlate);
const plazaTexts = plaza.signs.map((s) => s.text.replace(/\s+/g, " "));
const plazaOrigin = { x: layout.end!.center.x, y: FLOOR_Y, z: layout.end!.center.z };

/** End plaza orbit angles each pose is checked at (the topic labels ride the orbit). */
const ANGLES = Array.from({ length: 8 }, (_, i) => (i * 2 * Math.PI) / 8);
/** Zone sign texts and rooms, as the rendered sweep reads them. */
const ZONE_SIGN = { research: en.library.research.toUpperCase(), models: en.library.publications.toUpperCase(), talks: en.library.talks.toUpperCase() } as const;
const ZONE_ROOM = { research: "L4:research", models: "L4:publications", talks: "L4:talks" } as const;
const TIMELINE_KINDS = new Set(["section", "track", "lead", "spine"]);

/** The post room of the bay's spine (lead excepted) nearest `at`, as `pickSpine` pulls it at the bay's stop; null for a lead-only bay. */
function nearestSpine(bay: LibraryBay, at: Vec2): string | null {
  const [spine] = bay.slots.slice(1).sort((a, b) => Math.hypot(a.at.x - at.x, a.at.z - at.z) - Math.hypot(b.at.x - at.x, b.at.z - at.z));
  return spine ? roomOfPost(spine.slug) : null;
}

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

/** Shown-label caps of a device (`LIBRARY_LABEL_MAX`, lead titles by width). */
type Caps = Record<"section" | "track" | "lead" | "spine", number>;

/** The rendered sweep's audit: overlapping pairs, timeline plates on the rover, kinds over their cap, texts shown twice. */
function audit(plates: readonly Plate[], caps: Caps, rover: Quad | null) {
  const hits: string[] = [];
  for (let i = 0; i < plates.length; i++)
    for (let j = i + 1; j < plates.length; j++) {
      const share = overlapShare(plates[i].quad, plates[j].quad);
      if (share > 0.02) hits.push(`${plates[i].text} x ${plates[j].text} (${(share * 100).toFixed(1)}%)`);
    }
  const onRover = rover ? plates.filter((p) => TIMELINE_KINDS.has(p.kind) && overlapShare(p.quad, rover) > 0.02).map((p) => p.text) : [];
  const overCap = (Object.keys(caps) as (keyof Caps)[]).filter((k) => plates.filter((p) => p.kind === k).length > caps[k]);
  const seen = new Set<string>();
  const twice = plates.filter((p) => (seen.has(p.text) ? true : (seen.add(p.text), false))).map((p) => p.text);
  return { hits, onRover, overCap, twice };
}

/** Shown plates (timeline and end plaza) and the rover's screen quad for one frame at end plaza orbit angle `angle`, `live` the pulled spine's room. */
function frame(drive: Drive, camera: PerspectiveCamera, angle: number, live: string | null = null) {
  const v = new Vector3();
  const end = endPlazaFrame({ camera, signs: plaza.signs, sizes: plazaSizes, meta: plaza.meta, origin: plazaOrigin, angle, hovered: null, obstacles: PEDESTAL_OBSTACLE, size: drive.size, v, vault: vaultZone(drive.pos, layout.end!.vault) });
  const work = createLibraryFrame();
  const lib = libraryLabelFrame(work, { camera, signs: timeline.signs, meta: timeline.meta, half, origin: { x: 0, y: FLOOR_Y, z: 0 }, rover: drive.pos, rooms: undefined, live, size: drive.size, endBoxes: end.boxes, v });
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
  { id: "desktop", size: { width: 1440, height: 900 }, lead: LIBRARY_LABEL_MAX.lead.wide },
  { id: "phone", size: { width: 390, height: 844 }, lead: LIBRARY_LABEL_MAX.lead.narrow },
] as const;

describe.each(DEVICES)("L4 timeline labels ($id)", ({ id, size, lead }) => {
  const caps: Caps = { section: LIBRARY_LABEL_MAX.section, track: LIBRARY_LABEL_MAX.track, lead, spine: LIBRARY_LABEL_MAX.spine };

  it("never overlap, stay within the caps and show each bay's track and each zone's sign", () => {
    const drive = new Drive(size);
    const visited: string[] = [];
    /** Audits every orbit angle at the current pose; returns the plates shown at each angle (in `ANGLES` order). */
    const checkAngles = (pose: string, live: string | null = null) => {
      visited.push(pose);
      const camera = drive.camera();
      return ANGLES.map((angle) => {
        const { plates, rover } = frame(drive, camera, angle, live);
        expect(audit(plates, caps, rover), `${id} ${pose} at orbit ${angle.toFixed(2)}`).toEqual({ hits: [], onRover: [], overCap: [], twice: [] });
        return plates;
      });
    };
    /** Every plate shown at any orbit angle of the current pose. */
    const check = (pose: string, live: string | null = null) => checkAngles(pose, live).flat();

    check("approach");
    expect(layout.bays.length, `${id}: bays`).toBeGreaterThan(0);
    layout.bays.forEach((bay, i) => {
      // Mid-lane between this bay's spur and the previous one's.
      if (i > 0) {
        drive.to({ x: (layout.bays[i - 1].from.x + bay.from.x) / 2, z: bay.from.z });
        check(`lane-${i}`);
      }
      drive.to(bay.stop);
      const live = nearestSpine(bay, bay.stop);
      const name = tracks.get(bay.track)!.toUpperCase();
      const spine = live ? texts[timeline.meta.findIndex((m) => m.kind === "spine" && m.room === live)] : null;
      checkAngles(`bay-${bay.track}`, live).forEach((plates, k) => {
        const at = `${id} bay ${bay.track} at orbit ${ANGLES[k].toFixed(2)}`;
        expect(plates.some((p) => p.kind === "track" && p.text === name), `${at}: ${name}`).toBe(true);
        if (spine) expect(plates.some((p) => p.kind === "spine" && p.text === spine), `${at}: the live spine ${spine}`).toBe(true);
      });
    });

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

  it("reports overlaps, plates on the rover, kinds over their cap and repeated texts", () => {
    const plates = [plate("A", "lead", 0), plate("B", "lead", 50), plate("A", "track", 300)];
    const rover: Quad = [[310, 0], [330, 0], [330, 20], [310, 20]];
    expect(audit(plates, { section: 4, track: 4, lead: 1, spine: 1 }, rover)).toEqual({ hits: ["A x B (50.0%)"], onRover: ["A"], overCap: ["lead"], twice: ["A"] });
  });

  it("shows plates on the real floor (the sweep is not vacuous)", () => {
    const drive = new Drive({ width: 1440, height: 900 });
    const bay = layout.bays[0];
    drive.to(bay.stop);
    const { plates } = frame(drive, drive.camera(), 0, nearestSpine(bay, bay.stop));
    expect(plates.length).toBeGreaterThan(2);
  });
});
