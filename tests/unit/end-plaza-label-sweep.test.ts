import { Vector3, type PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { rotate, stepOrbit } from "@/experience/camera/orbit";
import { endPlazaSigns, PEDESTAL_OBSTACLE, type EndSignMeta } from "@/experience/floors/library/decor/EndPlaza";
import { endPlazaFrame, vaultZone } from "@/experience/floors/library/decor/signFrame";
import { orbSlots, topicPickOf } from "@/experience/floors/library/topics";
import { polygonArea, polygonOverlap, type Quad } from "@/experience/fx/labelPlacement";
import { signPlate } from "@/experience/fx/signLayout";
import type { TopicPick } from "@/store/useHQStore";
import en from "../../messages/en.json";
import guides from "../../content/study-guides.json";
import { L4_FLOOR_Y, L4Drive, l4Data as data, l4EndLabels, l4Floor as floor, l4Layout as layout } from "../helpers/l4-drive";

/**
 * The L4 end plaza label sweep without a renderer (it replaced the rendered sweep in `e2e/topics.spec.ts`; the nightly
 * `e2e/library-labels.spec.ts` still reads the rendered end plaza plates). The real L4 layout and end plaza signs, the
 * follow camera as `CameraDirector` settles it (`L4Drive`) and the scene's own per-frame placement (`endPlazaFrame`,
 * as `useEndSignPlacement` runs it), on a desktop and a phone, at the rendered sweep's poses: the plaza approach, the
 * constellation stop (idle, a topic picked, the camera orbited), the monument stop and the Study Vault stop. Every pose
 * is checked at several orbit angles of the topic labels: no two shown plates overlap by more than 2% of the smaller
 * (no exception: the count headline sits above the picked label at every orbit angle).
 */

const TOPICS = data.library.topics;
const SLOTS = orbSlots(TOPICS);
const ORIGIN = { x: layout.end!.center.x, y: L4_FLOOR_Y, z: layout.end!.center.z };
/** Topic label orbit angles each pose is checked at (the labels ride the orbit; the rendered sweep saw one of them). */
const ANGLES = Array.from({ length: 8 }, (_, i) => (i * 2 * Math.PI) / 8);
const VAULT_SIGN = en.hud.interact.studyVault.toUpperCase();
const CASE_STUDY = TOPICS.find((t) => t.slug === "case-study");

interface Plate {
  text: string;
  kind: EndSignMeta["kind"];
  picked?: boolean;
  quad: Quad;
}

/** The end plaza signs for a pick (null: none), with their plate sizes and texts, as `EndPlaza` builds them (`phone`: camera class `mobile`). */
function plazaFor(pick: TopicPick | null, phone = false) {
  const { signs, meta } = endPlazaSigns(layout, TOPICS, SLOTS, l4EndLabels, pick, phone);
  return { signs, meta, sizes: signs.map(signPlate), texts: signs.map((s) => s.text.replace(/\s+/g, " ")) };
}

/** The rendered sweep's check: pairs of shown plates whose screen quads overlap by more than 2% of the smaller one. */
function overlaps(plates: readonly Plate[]): string[] {
  const hits: string[] = [];
  for (let i = 0; i < plates.length; i++)
    for (let j = i + 1; j < plates.length; j++) {
      const a = plates[i].quad;
      const b = plates[j].quad;
      if (polygonOverlap(a, b) > 0.02 * Math.min(polygonArea(a), polygonArea(b))) hits.push(`${plates[i].text} x ${plates[j].text}`);
    }
  return hits;
}

/** The end plaza plates shown in one frame (the probe's `__hq.probes.topics.labels`), at topic orbit angle `angle`. */
function shownPlates(drive: L4Drive, camera: PerspectiveCamera, plaza: ReturnType<typeof plazaFor>, angle: number): Plate[] {
  const frame = endPlazaFrame({ camera, signs: plaza.signs, sizes: plaza.sizes, meta: plaza.meta, origin: ORIGIN, angle, hovered: null, obstacles: PEDESTAL_OBSTACLE, size: drive.size, v: new Vector3(), vault: vaultZone(drive.pos, layout.end!.vault) });
  const plates: Plate[] = [];
  plaza.signs.forEach((_, i) => {
    if (frame.shown[i] && frame.candidates[i].box) plates.push({ text: plaza.texts[i], kind: plaza.meta[i].kind, picked: plaza.meta[i].picked, quad: frame.quads[i] });
  });
  return plates;
}

const DEVICES = [
  { id: "desktop", minTopics: 4, size: { width: 1440, height: 900 } },
  { id: "phone", minTopics: 3, size: { width: 390, height: 844 } },
] as const;

describe.each(DEVICES)("L4 end plaza labels ($id)", ({ id, minTopics, size }) => {
  it("never overlap from the approach, the constellation (idle, picked, orbited), the monument and the vault", () => {
    expect(CASE_STUDY, "the case-study topic").toBeDefined();
    // Portrait phones draw the topic names and the vault spines at their phone sizes (the phone reading rule).
    const phone = id === "phone";
    const idle = plazaFor(null, phone);
    const picked = plazaFor(topicPickOf(CASE_STUDY!), phone);
    const drive = new L4Drive(size);
    /** Audits every topic orbit angle at the current camera; returns the plates shown at each angle. */
    const check = (pose: string, plaza: ReturnType<typeof plazaFor>) => {
      const camera = drive.camera();
      return ANGLES.map((angle) => {
        const plates = shownPlates(drive, camera, plaza, angle);
        expect(overlaps(plates), `${id} ${pose} at orbit ${angle.toFixed(2)}: ${plates.length} shown`).toEqual([]);
        return plates;
      });
    };

    const stop = floor.stops!["L4:topics"]!;
    const endX = stop.x + 6.5;
    // The plaza approach: the default follow camera heading east.
    drive.to({ x: endX - 20, z: 0 });
    drive.to({ x: endX - 12, z: 0 });
    check("approach", idle);

    // The constellation stop (its camera zone looks east): the bigger topics show, then a pick shows with its count.
    drive.to(stop);
    check("constellation", idle).forEach((plates, i) => expect(plates.filter((p) => p.kind === "topic").length, `${id} constellation at orbit ${ANGLES[i].toFixed(2)}: topics shown`).toBeGreaterThanOrEqual(minTopics));
    check("constellation, picked", picked).forEach((plates, i) => {
      const at = `${id} constellation, picked, at orbit ${ANGLES[i].toFixed(2)}`;
      expect(plates.some((p) => p.kind === "topic" && p.text === CASE_STUDY!.label), `${at}: the picked topic`).toBe(true);
      expect(plates.some((p) => p.kind === "count"), `${at}: the count`).toBe(true);
    });

    // The camera orbited a little around the rover (three taps of the rotate keys), a pick included.
    const home = drive.orbit.yaw;
    for (const turn of [-0.3, -0.1, 0.1, 0.3]) {
      rotate(drive.orbit, home + turn - drive.orbit.yaw);
      stepOrbit(drive.orbit, 1, true);
      check(`orbit ${turn}`, picked);
    }
    rotate(drive.orbit, home - drive.orbit.yaw);
    stepOrbit(drive.orbit, 1, true);

    // The monument stop (its camera zone looks north): every plate shows, nothing covers them.
    const monument = layout.end!.monument;
    expect(monument, "the research monument").toBeDefined();
    drive.to(monument!.stop);
    check("monument", idle).forEach((plates, i) => expect(plates.filter((p) => p.kind === "monument"), `${id} monument at orbit ${ANGLES[i].toFixed(2)}`).toHaveLength(5));

    // The Study Vault stop (its camera zone looks east at the books): every spine and the vault sign show.
    drive.to(floor.stops!["L4:vault"]!);
    check("vault", idle).forEach((plates, i) => {
      const at = `${id} vault at orbit ${ANGLES[i].toFixed(2)}`;
      expect(plates.filter((p) => p.kind === "guide").map((p) => p.text).sort(), `${at}: spines`).toEqual(guides.guides.map((g) => g.spine).sort());
      expect(plates.some((p) => p.kind === "vault" && p.text === VAULT_SIGN), `${at}: the Study Vault sign`).toBe(true);
    });
  });
});

describe("the end plaza sweep's check", () => {
  const plate = (text: string, x: number): Plate => ({ text, kind: "topic", quad: [[x, 0], [x + 100, 0], [x + 100, 30], [x, 30]] });

  it("reports plates that overlap by more than 2% of the smaller one", () => {
    expect(overlaps([plate("A", 0), plate("B", 50), plate("C", 99)])).toEqual(["A x B", "B x C"]);
    expect(overlaps([plate("A", 0), plate("B", 99)])).toEqual([]);
  });

  it("makes no exception for the picked label over the count headline (#297)", () => {
    const count: Plate = { ...plate("6 pieces", 50), kind: "count" };
    expect(overlaps([{ ...plate("Picked", 0), picked: true }, count])).toEqual(["Picked x 6 pieces"]);
    expect(overlaps([plate("Other", 0), count])).toEqual(["Other x 6 pieces"]);
  });
});
