import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import type { FloorId } from "@/content/schema";
import { buildFloorLayouts } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { buildLabsLayout } from "@/experience/floors/labs/layout";
import { readableLabels as labsLabels } from "@/experience/floors/labs/readable";
import { postTitles } from "@/experience/floors/library/decor/common";
import { endPlazaSigns } from "@/experience/floors/library/decor/EndPlaza";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { libraryLayoutInput, type LibrarySection } from "@/experience/floors/library/model";
import { readableLabels as libraryLabels } from "@/experience/floors/library/readable";
import { orbSlots, topicPickOf } from "@/experience/floors/library/topics";
import type { Readable } from "@/experience/readable";
import { cameraClass } from "@/lib/viewport";
import en from "../../messages/en.json";
import { l4EndLabels } from "../helpers/l4-drive";
import { cameraOf, emPx, endsPx, facingAngle, readingPose, screen } from "../helpers/phone-camera";

/**
 * The phone reading rule (spec 2026-10-28 section 4.2, owner decision): every title and name on L2, L3, L4 and RF reads
 * at least 10 CSS px tall (its em box, projected) on a 390 x 844 portrait phone and 9 px on a 375 x 667 one, from the pose
 * a visitor reads it from (camera class `mobile`; `readingPose` settles it like `CameraDirector`). The label stands in
 * front of the camera with its middle in the HUD-free box and both ends on screen, the rover stays in frame, and a label
 * with a fixed facing faces the camera within 60 degrees. Fixes are phone-only (a zone's `classView.mobile`, a label's
 * phone size), so the desktop and tablet sizes stay as they were (pinned below). `PHONE_READING_ALL=1` prints every
 * label's sizes, not just the misses.
 */
type Floor = "L3" | "L4";
const FLOORS: readonly Floor[] = ["L3", "L4"];
const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
const career = careerLayoutInput(data.career);
const libraryInput = libraryLayoutInput(data.library);
const layouts = buildFloorLayouts(data.years.length, { labs: data.labs.pods, career, library: libraryInput });

const labs = buildLabsLayout(data.labs.pods);
const reactor = { rings: en.labs.reactor.rings, uses: (count: number, tech: string) => `${count} projects use ${tech}` };

const library = buildLibraryLayout(libraryInput);
const zones: Record<LibrarySection, string> = { blog: en.library.posts, research: en.library.research, models: en.library.publications, talks: en.library.talks };
const tracks = new Map(data.library.tracks.map((t) => [t.slug, t.label]));
const topics = data.library.topics;
const picked = topics[0];

const LABELS: Record<Floor, Readable[]> = {
  L3: labsLabels({ layout: labs, wings: data.labs.wings, reactor, ops: data.labs.ops.sign }),
  L4: libraryLabels({
    layout: library,
    zones,
    titles: postTitles(data.library),
    tracks,
    end: {
      desktop: endPlazaSigns(library, topics, orbSlots(topics), l4EndLabels, picked ? topicPickOf(picked) : null),
      phone: endPlazaSigns(library, topics, orbSlots(topics), l4EndLabels, picked ? topicPickOf(picked) : null, true),
    },
  }),
};

const SIZES = [
  { w: 390, h: 844, min: 10 },
  { w: 375, h: 667, min: 9 },
] as const;
const MAX_FACING = Math.PI / 3;
/** The phone's HUD-free box (`PHONE_SAFE` in e2e/hq.ts, as in arrivals.test.ts): the label's middle stays inside it. */
const SAFE = { top: 120, bottom: 140, side: 24 };

/** Desktop and tablet type sizes (u) per floor: the phone rule leaves them as they were. */
const DESKTOP_SIZES: Record<Floor, number[]> = {
  L3: [0.46, 0.5, 0.6, 0.62, 0.7],
  L4: [0.34, 0.36, 0.4, 0.44, 0.5, 0.6, 0.62, 0.7, 0.95],
};

function measure(floor: FloorId, l: Readable, w: number, h: number) {
  const pose = readingPose(floor, layouts[floor], l.reading, w, h);
  const camera = cameraOf(pose, w, h);
  const cls = cameraClass(w, h);
  const safe = (p: { x: number; y: number; front: boolean }) => p.front && p.x >= SAFE.side && p.x <= w - SAFE.side && p.y >= SAFE.top && p.y <= h - SAFE.bottom;
  const p = screen(camera, w, h, l.at);
  const ends = endsPx(camera, w, h, l, cls);
  const whole = !ends || ends.every((e) => e.front && e.x >= 0 && e.x <= w);
  const rover = safe(screen(camera, w, h, [l.reading.at.x, 1, l.reading.at.z]));
  return { px: emPx(camera, w, h, l, cls), front: p.front, inside: safe(p) && whole, rover, at: p, facing: facingAngle(l, pose.position) };
}

/** Every label that misses the rule, with its sizes at both screens and its facing (printed for tuning). */
function failures(): string[] {
  const out: string[] = [];
  for (const floor of FLOORS)
    for (const l of LABELS[floor]) {
      const m = SIZES.map(({ w, h }) => measure(floor, l, w, h));
      const bad = m.some((x, i) => !x.front || !x.inside || !x.rover || x.px < SIZES[i].min || x.facing > MAX_FACING);
      if (bad || process.env.PHONE_READING_ALL) out.push(`${floor} ${l.id}: ${m.map((x) => `${x.px.toFixed(1)} px${x.front ? "" : " behind"}${x.inside ? "" : ` out (${x.at.x.toFixed(0)}, ${x.at.y.toFixed(0)})`}${x.rover ? "" : " no rover"}`).join(", ")}; facing ${((m[0].facing * 180) / Math.PI).toFixed(0)} deg`);
    }
  return out;
}

describe("phone reading rule (L2, L3, L4, RF)", () => {
  it("prints the labels that miss the rule", () => {
    const list = failures();
    if (list.length) console.log(`Phone reading failures (390x844, 375x667):\n${list.join("\n")}`);
    expect(Array.isArray(list)).toBe(true);
  });
  for (const floor of FLOORS) {
    const list = LABELS[floor];
    it(`${floor} lists its titles and names, with phone sizes only ever larger and desktop sizes as they were`, () => {
      expect(list.length).toBeGreaterThan(3);
      for (const l of list) expect(l.phoneFontSize ?? l.fontSize, l.id).toBeGreaterThanOrEqual(l.fontSize);
      expect([...new Set(list.map((l) => l.fontSize))].sort((a, b) => a - b)).toEqual(DESKTOP_SIZES[floor]);
    });
    for (const l of list) {
      it(`${floor} ${l.id} reads on portrait phones`, () => {
        for (const { w, h, min } of SIZES) {
          const m = measure(floor, l, w, h);
          const what = `${floor} ${l.id} "${l.text.slice(0, 24)}" at ${w}x${h}`;
          expect(m.front, `${what}: in front of the camera`).toBe(true);
          expect(m.inside, `${what}: on screen clear of the HUD at (${m.at.x.toFixed(0)}, ${m.at.y.toFixed(0)})`).toBe(true);
          expect(m.rover, `${what}: the rover in frame`).toBe(true);
          expect(m.px, `${what}: em ${m.px.toFixed(1)} px`).toBeGreaterThanOrEqual(min);
          expect(m.facing, `${what}: facing ${((m.facing * 180) / Math.PI).toFixed(0)} deg`).toBeLessThanOrEqual(MAX_FACING);
        }
      });
    }
  }
});
