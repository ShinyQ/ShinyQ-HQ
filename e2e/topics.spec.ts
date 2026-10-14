import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import { polygonArea, polygonOverlap } from "../src/experience/fx/labelPlacement";
import {
  asReturningVisitor,
  chooseMotion,
  collectErrors,
  driveTo,
  enterFloorRoute,
  expectRenderBudget,
  openPage,
  padsOf,
  targetPoint,
  visibleTarget,
  waitForCameraSettle,
  waitForFrames,
  waitForHQ,
  waitForPhase,
  waitForRoom,
  waitForSceneLive,
} from "./hq";

/**
 * L4 Topic Constellation (owner request 2026-10-14): the end plaza of the Writing floor. Picking a topic
 * (drawer or orb) lights its stations and desks, glows the road to them and floats "N pieces on X"; the
 * `#library-topic=<slug>` deep link, Cmd-K (3D and the Classic site filter), the research monument, the
 * Express Return pad and reduced motion.
 */
test.describe.configure({ timeout: 180_000 });

type Box = { text: string; kind: string; x0: number; y0: number; x1: number; y1: number; quad: [number, number][] };
type Topics = { topic: string | null; lit: string[]; roads: number; orbit: number; orbs: { slug: string; x: number; y: number; z: number }[]; monument: string[] | null; labels: Box[] };
type TW = Window & {
  __hq: {
    store: { getState: () => Record<string, unknown> & { topics: { topic: { slug: string } | null }; openRoom: (r: string) => void; selectTopic: (t: unknown) => void; beam: unknown; activeRoom: string | null } };
    probes: { topics: Topics; signs: Record<string, { text: string }[]> };
    layouts: Record<string, { stops?: Record<string, { x: number; z: number }>; approach: { x: number; z: number } }>;
    interact: { project: (p: { x: number; y: number; z: number }) => { x: number; y: number } | null; floorY: number };
    rover: { x: number; z: number };
  };
};
type View = { topics: { topics: { slug: string; label: string; items: { room: string; kind: string }[] }[] } };

const probe = (page: Page) =>
  page.evaluate(() => {
    const t = (window as unknown as TW).__hq.probes.topics;
    return { topic: t.topic, lit: [...t.lit].sort(), roads: t.roads, orbit: t.orbit, monument: t.monument };
  });
/** Sign texts with line wraps folded to spaces. */
const signs = (page: Page) => page.evaluate(() => ((window as unknown as TW).__hq.probes.signs["library-end-signs"] ?? []).map((s) => s.text.replace(/\s+/g, " ")));

async function topicOf(page: Page, slug: string) {
  const res = await page.request.get("/data/rooms/en.json");
  const view = ((await res.json()) as Record<string, View>)["L4:topics"].topics;
  const topic = view.topics.find((t) => t.slug === slug)!;
  return { ...topic, rooms: [...new Set(topic.items.map((i) => i.room))].sort() };
}

async function openTopics(page: Page) {
  await page.evaluate(() => (window as unknown as TW).__hq.store.getState().openRoom("L4:topics"));
  await waitForRoom(page, "L4:topics");
  await expect(page.getByTestId("topics-body")).toBeVisible();
}

test("picking a topic in the drawer lights its stations, glows their roads and floats the count", async ({ page }) => {
  const errors = collectErrors(page);
  await enterFloorRoute(page, "/en/library");
  const sentiment = await topicOf(page, "sentiment-analysis");
  await openTopics(page);
  await page.locator("[data-testid=topics-list] [data-topic=sentiment-analysis]").click();
  await expect(page.getByTestId("topics-pieces")).toHaveText(`${sentiment.items.length} pieces on Sentiment analysis`);
  await expect(page.getByTestId("topic-piece")).toHaveCount(sentiment.items.length);
  await expect.poll(() => probe(page)).toMatchObject({ topic: "sentiment-analysis", lit: sentiment.rooms });
  // The timeline run back to the westmost lit desk plus a spur per lit desk.
  expect((await probe(page)).roads).toBe(sentiment.rooms.length + 1);
  // The headline shows where the plaza is on screen: from the plaza approach.
  await page.keyboard.press("Escape");
  await waitForPhase(page, "explore");
  const stop = await page.evaluate(() => (window as unknown as TW).__hq.layouts.L4.stops!["L4:topics"]);
  await driveTo(page, { x: stop.x - 6, z: 0 });
  await waitForCameraSettle(page);
  await expect.poll(() => signs(page)).toContain(`${sentiment.items.length} pieces on Sentiment analysis`);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#library-topic=sentiment-analysis");
  await expectRenderBudget(page);

  // The hash survives closing the drawer; Clear turns everything off.
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#library-topic=sentiment-analysis");
  await openTopics(page);
  await page.getByTestId("topics-clear").click();
  await expect.poll(() => probe(page)).toMatchObject({ topic: null, lit: [], roads: 0 });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("");
  await expect.poll(async () => (await signs(page)).some((s) => s.includes("pieces on"))).toBe(false);
  expect(errors).toEqual([]);
});

test("an orb click picks its topic and a second click clears it; the pedestal opens the drawer", async ({ page }) => {
  // Reduced motion holds the orbit, so the orb stays under the pointer.
  await chooseMotion(page, "reduced");
  await enterFloorRoute(page, "/en/library");
  const stop = await page.evaluate(() => (window as unknown as TW).__hq.layouts.L4.stops!["L4:topics"]);
  await driveTo(page, stop);
  await waitForCameraSettle(page);
  const orb = async (slug: string) =>
    page.evaluate((s) => {
      const hq = (window as unknown as TW).__hq;
      const o = hq.probes.topics.orbs.find((x) => x.slug === s)!;
      return hq.interact.project({ x: o.x, y: hq.interact.floorY + o.y, z: o.z });
    }, slug);
  // The most central orb on screen (whichever it is).
  const slugs = await page.evaluate(() => (window as unknown as TW).__hq.probes.topics.orbs.map((o) => o.slug));
  const size = page.viewportSize()!;
  let best: { slug: string; x: number; y: number } | null = null;
  for (const slug of slugs) {
    const p = await orb(slug);
    if (!p || p.x < 80 || p.x > size.width - 80 || p.y < 140 || p.y > size.height - 160) continue;
    if (!best || Math.abs(p.x - size.width / 2) < Math.abs(best.x - size.width / 2)) best = { slug, ...p };
  }
  expect(best).not.toBeNull();
  await page.mouse.click(best!.x, best!.y);
  await expect.poll(async () => (await probe(page)).topic).toBe(best!.slug);
  await page.mouse.click(best!.x, best!.y);
  await expect.poll(async () => (await probe(page)).topic).toBeNull();

  const pedestal = await visibleTarget(page, { kinds: ["station"] });
  expect(pedestal.id).toBe("L4:station:topics");
  const point = await targetPoint(page, pedestal.id);
  await page.mouse.click(point.x, point.y);
  await waitForRoom(page, "L4:topics");
});

test("the #library-topic deep link opens the constellation with that topic picked", async ({ page }) => {
  await asReturningVisitor(page);
  await page.goto("/en/library?tier=lite#library-topic=voice-ai");
  await waitForHQ(page);
  await waitForRoom(page, "L4:topics");
  await waitForSceneLive(page);
  await expect(page.getByTestId("topics-selection")).toHaveAttribute("data-topic", "voice-ai");
  await expect(page.locator("[data-testid=topics-list] [data-topic=voice-ai]")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => probe(page)).toMatchObject({ topic: "voice-ai", lit: ["L4:making-a-voice-agent-interruptible"] });
  expect(page.url()).toContain("/en/library?tier=lite#library-topic=voice-ai");
});

test("Cmd-K shows the writing about a topic in the tower", async ({ page }) => {
  await enterFloorRoute(page, "/en/library");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("show writing about ai agents");
  await expect(page.getByRole("option").first()).toContainText("Show writing about AI agents");
  await page.keyboard.press("Enter");
  await waitForRoom(page, "L4:topics", 150_000);
  await expect.poll(async () => (await probe(page)).topic).toBe("ai-agents");
});

test("Cmd-K on the Classic site opens the Writing page filtered by the topic", async ({ page }) => {
  await openPage(page, "/en/library?tier=static");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("show writing about sentiment analysis");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/en\/library\?(.*&)?topic=sentiment-analysis/);
  const filter = page.getByTestId("topic-filter");
  await expect(filter.locator("[data-topic=sentiment-analysis]")).toHaveAttribute("aria-pressed", "true");
  // Only papers and models are on the topic: the Blog and Talks sections hide.
  await expect(page.locator("#posts")).toBeHidden();
  await expect(page.locator("#talks")).toBeHidden();
  await expect(page.locator("#research [data-topic-row]:visible")).not.toHaveCount(0);
  await filter.getByRole("button", { name: /^All topics/ }).click();
  await expect(page.locator("#posts")).toBeVisible();
  await expect(page).not.toHaveURL(/topic=/);
});

test("the research monument shows the metrics with their date and opens the Research desk", async ({ page }) => {
  await enterFloorRoute(page, "/en/library");
  const monument = await page.evaluate(() => (window as unknown as { __hq: { interact: { items: { id: string; at: { x: number; z: number } }[] } } }).__hq.interact.items.find((i) => i.id === "L4:station:metrics")!.at);
  await driveTo(page, monument);
  await waitForCameraSettle(page);
  const metrics = await probe(page);
  expect(metrics.monument).toEqual([expect.stringMatching(/^\d+$/), expect.stringMatching(/^\d+$/), expect.stringMatching(/^Google Scholar · as of [A-Z][a-z]{2} \d{4}$/)]);
  const texts = await signs(page);
  expect(texts).toContain(en.library.topics.monument.citations.toUpperCase());
  expect(texts.some((t) => /as of [A-Z][a-z]{2} \d{4}$/.test(t))).toBe(true);
  await driveTo(page, { x: monument.x, z: monument.z + 4 });
  await waitForCameraSettle(page);
  const item = await visibleTarget(page, { kinds: ["station"] });
  expect(item.id).toBe("L4:station:metrics");
  const point = await targetPoint(page, item.id);
  await page.mouse.click(point.x, point.y);
  await waitForRoom(page, "L4:research", 120_000);
  const at = await page.evaluate(() => (window as unknown as TW).__hq.rover);
  expect(Math.hypot(at.x - monument.x, at.z - monument.z)).toBeLessThan(2);
});

test("the Express Return pad by the constellation beams the rover to the elevator", async ({ page }) => {
  const errors = collectErrors(page);
  await enterFloorRoute(page, "/en/library");
  const back = (await padsOf(page, "L4")).find((p) => p.id === "return:L4")!;
  expect(back).toBeTruthy();
  await driveTo(page, back.at);
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as TW).__hq.store.getState().beam)), { timeout: 30_000 }).toBe(false);
  const lift = await page.evaluate(() => (window as unknown as TW).__hq.layouts.L4.approach);
  await expect.poll(async () => {
    const r = await page.evaluate(() => (window as unknown as TW).__hq.rover);
    return Math.hypot(r.x - lift.x, r.z - lift.z);
  }, { timeout: 60_000 }).toBeLessThan(0.5);
  expect(await signs(page)).not.toContain(en.hud.interact.returnPad);
  expect(errors).toEqual([]);
});

test("reduced motion holds the orbit still, a pick included", async ({ page }) => {
  await chooseMotion(page, "reduced");
  await enterFloorRoute(page, "/en/library");
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as TW).__hq.probes.topics.orbs.length))).toBeGreaterThan(0);
  const before = (await probe(page)).orbit;
  await openTopics(page);
  await page.locator("[data-testid=topics-list] [data-topic=case-study]").click();
  await waitForFrames(page, 30);
  expect((await probe(page)).orbit).toBe(before);
});

/** Pairs of shown end-plaza signs whose projected plates (screen quads) overlap by more than 2% of the smaller one. */
async function labelCollisions(page: Page) {
  const boxes = await page.evaluate(() => (window as unknown as TW).__hq.probes.topics.labels);
  const hits: string[] = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (polygonOverlap(a.quad, b.quad) > 0.02 * Math.min(polygonArea(a.quad), polygonArea(b.quad))) hits.push(`${a.text} x ${b.text}`);
    }
  return { boxes, hits };
}

for (const device of [
  { id: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  { id: "phone", use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
]) {
  test.describe(`end plaza labels (${device.id})`, () => {
    test.use(device.use);
    test("never overlap on screen from the approach, the camera zones and while orbiting, a pick included", async ({ page }) => {
      test.setTimeout(300_000);
      await enterFloorRoute(page, "/en/library");
      const { stop, end } = await page.evaluate(() => {
        const hq = (window as unknown as TW).__hq;
        return { stop: hq.layouts.L4.stops!["L4:topics"], end: { x: hq.layouts.L4.stops!["L4:topics"].x + 6.5, z: 0 } };
      });
      const monument = await page.evaluate(() => (window as unknown as { __hq: { interact: { items: { id: string; at: { x: number; z: number } }[] } } }).__hq.interact.items.find((i) => i.id === "L4:station:metrics")!.at);
      const voice = await topicOf(page, "case-study");
      const check = async (pose: string) => {
        await waitForCameraSettle(page);
        await waitForFrames(page, 30);
        const { boxes, hits } = await labelCollisions(page);
        expect(hits, `${device.id} ${pose}: ${boxes.length} shown`).toEqual([]);
        return boxes;
      };
      // The plaza approach: the default follow camera heading east.
      await driveTo(page, { x: end.x - 20, z: 0 });
      await driveTo(page, { x: end.x - 12, z: 0 });
      await check("approach");
      // The constellation stop (camera zone looking east), then a pick.
      await driveTo(page, stop);
      const idle = await check("constellation");
      expect(idle.filter((b) => b.kind === "topic").length).toBeGreaterThanOrEqual(device.id === "phone" ? 3 : 4);
      await page.evaluate((t) => (window as unknown as TW).__hq.store.getState().selectTopic({ slug: t.slug, name: t.label, count: t.items.length, rooms: t.rooms }), voice);
      const picked = await check("constellation, picked");
      expect(picked.some((b) => b.kind === "topic" && b.text === "Case studies")).toBe(true);
      expect(picked.some((b) => b.kind === "count")).toBe(true);
      // Orbiting the camera around the rover.
      for (let i = 0; i < 3; i++) await page.keyboard.press("q");
      await check("orbit");
      // The monument stop (camera zone looking north): every plate shows, nothing covers them.
      await driveTo(page, monument);
      const atMonument = await check("monument");
      expect(atMonument.filter((b) => b.kind === "monument")).toHaveLength(5);
    });
  });
}
