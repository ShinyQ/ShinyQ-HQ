import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import { polygonArea, polygonOverlap } from "../src/experience/fx/labelPlacement";
import { collectErrors, driveTo, enterFloorRoute, expectRenderBudget, readGpuCounters, readRenderPeaks, resetRenderPeaks, waitForCameraSettle, waitForFrames } from "./hq";

/**
 * L4 declutter (Round 7 F): the timeline signs (sections, post titles, year plates) and the end plaza signs
 * never cover each other or the rover on screen, from the arrival, along the posts, mid-floor and at each zone, on a
 * desktop (full tier) and a phone (lite tier). Titles stay within their cap, no text shows twice and each
 * zone shows its own sign. `L4_SHOTS=<dir>` also writes a screenshot per pose and the render numbers per
 * device; `L4_SHOTS_BASELINE=1` skips the checks that need the new placement (a run against `out-main`).
 */
// The full tier draws a few frames a second on SwiftShader (CI), and the rover drives per rendered frame.
test.describe.configure({ timeout: 600_000 });

type Box = { text: string; kind: string; x0: number; y0: number; x1: number; y1: number; quad: [number, number][] };
type Vec2 = { x: number; z: number };
type LW = Window & {
  __hq: {
    probes: { library?: { labels: Box[] }; topics?: { labels: Box[] } };
    layouts: Record<string, { road?: { spurs: { room: string; from: Vec2; to: Vec2 }[] } }>;
    store: { getState: () => { phase: string; activeRoom: string | null } };
    interact: { project: (p: { x: number; y: number; z: number }) => { x: number; y: number } | null; floorY: number };
    rover: { x: number; z: number };
  };
};

const SHOTS = process.env.L4_SHOTS;
const BASELINE = Boolean(process.env.L4_SHOTS_BASELINE);
/** Zone sign texts, as `zoneSignSpecs` writes them (`library.*` messages, uppercase). */
const ZONE_SIGN = { research: en.library.research.toUpperCase(), models: en.library.publications.toUpperCase(), talks: en.library.talks.toUpperCase() } as const;
const ZONE_ROOM = { research: "L4:research", models: "L4:publications", talks: "L4:talks" } as const;
type Zone = keyof typeof ZONE_ROOM;

/** Shown timeline and end plaza plates (alpha above 0.5); the library probe is absent in builds before the declutter. */
const shownLabels = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as LW).__hq.probes;
    return [...(p.library?.labels ?? []), ...(p.topics?.labels ?? [])];
  });

/** Kinds the timeline placement owns (the end plaza's own signs do not avoid the rover). */
const TIMELINE_KINDS = new Set(["section", "title", "year"]);
/** Matches `useLibrarySignPlacement`: the rover's bounds, 0.9 u around it and `ROVER_HEIGHT` (2.8 u) tall. */
const ROVER_BOUNDS = { half: 0.9, height: 2.8 };

/**
 * The rover's screen quad (its projected bounds as an axis-aligned box), or null when a corner is off
 * screen (`interact.project` returns null there).
 */
const roverQuad = (page: Page) =>
  page.evaluate((r) => {
    const hq = (window as unknown as LW).__hq;
    const pts: { x: number; y: number }[] = [];
    for (let c = 0; c < 8; c++) {
      const p = hq.interact.project({ x: hq.rover.x + (c & 1 ? r.half : -r.half), y: hq.interact.floorY + (c & 2 ? r.height : 0), z: hq.rover.z + (c & 4 ? r.half : -r.half) });
      if (!p) return null;
      pts.push(p);
    }
    const [x0, x1, y0, y1] = [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))];
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][];
  }, ROVER_BOUNDS);

/** Overlap of two quads as a share of the smaller one; 0 when the smaller is at most 1 px squared (no NaN). */
function overlapShare(a: [number, number][], b: [number, number][]) {
  const min = Math.min(polygonArea(a), polygonArea(b));
  return min <= 1 ? 0 : polygonOverlap(a, b) / min;
}

/** What the gate checks on one read: overlapping pairs, labels on the rover, titles over the cap, texts shown twice. */
function audit(boxes: Box[], titleCap: number, rover: [number, number][] | null = null) {
  const hits: string[] = [];
  let worst = 0;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const share = overlapShare(a.quad, b.quad);
      worst = Math.max(worst, share);
      if (share > 0.02) hits.push(`${a.text} x ${b.text} (${(share * 100).toFixed(1)}%)`);
    }
  const onRover = rover
    ? boxes.filter((b) => TIMELINE_KINDS.has(b.kind) && overlapShare(b.quad, rover) > 0.02).map((b) => `${b.text} (${(overlapShare(b.quad, rover) * 100).toFixed(1)}%)`)
    : [];
  const titles = boxes.filter((b) => b.kind === "title").length;
  const seen = new Set<string>();
  const twice = boxes.filter((b) => (seen.has(b.text) ? true : (seen.add(b.text), false))).map((b) => b.text);
  return { hits, onRover, overCap: Math.max(0, titles - titleCap), twice, worst };
}

for (const device of [
  { id: "desktop", tier: "full", titleCap: 6, use: { viewport: { width: 1440, height: 900 } } },
  { id: "phone", tier: "lite", titleCap: 4, use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
] as const) {
  test.describe(`L4 timeline labels (${device.id})`, () => {
    test.use(device.use);
    test("never overlap, stay within the title cap and show each zone's sign", async ({ page }) => {
      // Captures add the door poses and a measured window per pose (the full tier draws about 3 frames a second on SwiftShader).
      if (SHOTS) test.setTimeout(1_800_000);
      const errors = collectErrors(page);
      // Rover's first-visit floor line would cover the middle of the view (captures): mark it as spoken.
      await page.addInitScript(() => localStorage.setItem("hq:walk-prompt", JSON.stringify(["L4"])));
      await enterFloorRoute(page, "/en/library", { tier: device.tier });
      const spurs = await page.evaluate((rooms) => {
        const net = (window as unknown as LW).__hq.layouts.L4.road!;
        return Object.fromEntries(rooms.map((r) => [r, net.spurs.find((s) => s.room === r)!])) as Record<string, { from: Vec2; to: Vec2 }>;
      }, Object.values(ZONE_ROOM));
      const numbers: { pose: string; sceneCalls: number; triangles: number; programs: number }[] = [];
      let worst = 0;

      const settle = async () => {
        await waitForCameraSettle(page);
        await waitForFrames(page, 30);
      };
      const capture = async (pose: string) => {
        if (!SHOTS) return;
        await resetRenderPeaks(page);
        // Longer than one pass of the orbiting end plaza labels (about 110 frames), which come into view now and then.
        await waitForFrames(page, 150, 1200);
        const peaks = await readRenderPeaks(page);
        const gpu = await readGpuCounters(page);
        numbers.push({ pose, sceneCalls: peaks.sceneCalls, triangles: peaks.triangles, programs: gpu.programs });
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: `${SHOTS}/${device.id}-${pose}.png` });
      };
      /** Settles, captures, then checks one pose; returns the shown plates. */
      const check = async (pose: string) => {
        await settle();
        await capture(pose);
        // The probe and the drawn opacity can be a frame apart: poll until one read is clean.
        let last = audit([], device.titleCap);
        let boxes: Box[] = [];
        await expect
          .poll(
            async () => {
              boxes = await shownLabels(page);
              last = audit(boxes, device.titleCap, await roverQuad(page));
              return BASELINE ? { hits: [], onRover: [], overCap: 0, twice: [] } : { hits: last.hits, onRover: last.onRover, overCap: last.overCap, twice: last.twice };
            },
            { message: `${device.id} ${pose}`, timeout: 10_000 },
          )
          .toEqual({ hits: [], onRover: [], overCap: 0, twice: [] });
        worst = Math.max(worst, last.worst);
        test.info().annotations.push({ type: `${device.id} ${pose}`, description: boxes.map((b) => `${b.kind}:${b.text}`).join(" | ") || "(none)" });
        return boxes;
      };
      /** True when a zone's sign shows (polled briefly: it fades in). */
      const zoneSignShown = async (zone: Zone) => {
        try {
          await expect.poll(async () => (await shownLabels(page)).some((b) => b.kind === "section" && b.text === ZONE_SIGN[zone]), { timeout: 3_000 }).toBe(true);
          return true;
        } catch {
          // Where the sign would sit and the rover box it keeps clear of, for the report.
          const why = await page.evaluate((text) => {
            const lib = (window as unknown as { __hq: { probes: { library?: { hidden?: { text: string; x0: number; y0: number; x1: number; y1: number }[]; rover?: unknown } } } }).__hq.probes.library;
            return { sign: lib?.hidden?.find((b) => b.text === text) ?? null, rover: lib?.rover ?? null };
          }, ZONE_SIGN[zone]);
          test.info().annotations.push({ type: `${device.id} ${zone} sign hidden`, description: JSON.stringify(why) });
          return false;
        }
      };

      await check("approach");
      await driveTo(page, { x: 8, z: 0 });
      const posts = await check("posts");
      await driveTo(page, { x: 24, z: 0 });
      const mid = await check("mid");
      // Along the posts the nearest titles show.
      if (!BASELINE) expect([...posts, ...mid].some((b) => b.kind === "title"), `${device.id}: a post title at posts or mid`).toBe(true);
      if (!SHOTS) await expectRenderBudget(page);

      for (const zone of ["research", "models", "talks"] as const) {
        const spur = spurs[ZONE_ROOM[zone]];
        await driveTo(page, spur.from);
        await check(zone);
        let shown = await zoneSignShown(zone);
        // Captures always take the door pose too, so before and after runs list the same poses.
        if (!shown || SHOTS) {
          // The station's spur, short of the door pad (stopping on the pad would open the room).
          const len = Math.hypot(spur.to.x - spur.from.x, spur.to.z - spur.from.z);
          const k = Math.max(0, (len - 2) / len);
          await driveTo(page, { x: spur.from.x + (spur.to.x - spur.from.x) * k, z: spur.from.z + (spur.to.z - spur.from.z) * k });
          await check(`${zone}-door`);
          shown ||= await zoneSignShown(zone);
        }
        // Soft: a missing sign still fails the test, but the remaining zones (and captures) still run.
        if (!BASELINE) expect.soft(shown, `${device.id}: ${ZONE_SIGN[zone]} sign at the ${zone} zone`).toBe(true);
      }

      test.info().annotations.push({ type: "max overlap", description: `${device.id}: ${(worst * 100).toFixed(2)}% of the smaller plate` });
      if (SHOTS) writeFileSync(`${SHOTS}/${device.id}.json`, `${JSON.stringify({ device: device.id, tier: device.tier, maxOverlap: worst, poses: numbers }, null, 2)}\n`);
      expect(errors).toEqual([]);
    });
  });
}
