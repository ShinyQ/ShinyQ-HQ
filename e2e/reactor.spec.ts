import { expect, test, type Page } from "@playwright/test";
import { chooseMotion, asReturningVisitor, collectErrors, driveTo, enterFloorRoute, expectRenderBudget, visibleTarget, targetPoint, waitForFrames, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive, fastAnimations } from "./hq";

// Rides, drives, camera eases and the intro at the test-only animation speed (render-peak windows measure at real speed).
test.beforeEach(({ context }) => fastAnimations(context));

/**
 * L3 Tech Reactor (design 2026-10-14, section 2): the reactor core as a project filter. Picking a tech in
 * the drawer lights its docked pods and the roads to them and floats "N projects use X"; ring targets,
 * Surprise me, the `#labs-tech=<slug>` deep link, Cmd-K and reduced motion.
 */
test.describe.configure({ timeout: 180_000 });

type Reactor = { tech: string | null; lit: string[]; roads: number; surprise: string | null; boost: number };
type RW = Window & {
  __hq: {
    store: { getState: () => Record<string, unknown> & { reactor: { tech: { slug: string } | null; ring: string; spin: number }; openRoom: (r: string) => void } };
    probes: { reactor: Reactor; signs: Record<string, { text: string }[]>; spectacle: Record<string, number> };
    layouts: Record<string, { stops?: Record<string, { x: number; z: number }> }>;
  };
};
type View = { reactor: { rings: { id: string; techs: { slug: string; name: string; pods: string[] }[] }[]; pods: Record<string, { docked: boolean }> } };

/** The probe with `lit` sorted (it follows the docking order, the index follows site order). */
const probe = (page: Page) =>
  page.evaluate(() => {
    const r = (window as unknown as RW).__hq.probes.reactor;
    return { ...r, lit: [...r.lit].sort() };
  });
const signs = (page: Page) => page.evaluate(() => ((window as unknown as RW).__hq.probes.signs["labs-reactor-signs"] ?? []).map((s) => s.text));

async function reactorView(page: Page): Promise<View["reactor"]> {
  const res = await page.request.get("/data/rooms/en-L3.json");
  return ((await res.json()) as Record<string, View>)["L3:reactor"].reactor;
}

async function techOf(page: Page, slug: string) {
  const view = await reactorView(page);
  const ring = view.rings.find((r) => r.techs.some((t) => t.slug === slug))!;
  const tech = ring.techs.find((t) => t.slug === slug)!;
  return { ...tech, ring: ring.id, docked: tech.pods.filter((p) => view.pods[p].docked).sort() };
}

async function openReactor(page: Page) {
  await page.evaluate(() => (window as unknown as RW).__hq.store.getState().openRoom("L3:reactor"));
  await waitForRoom(page, "L3:reactor");
  await expect(page.getByTestId("reactor-body")).toBeVisible();
}

test("picking a tech in the drawer lights its pods, glows their roads and floats the count", async ({ page }) => {
  const errors = collectErrors(page);
  await enterFloorRoute(page, "/en/labs");
  const cosmos = await techOf(page, "cosmos-db");
  expect(cosmos.docked.length).toBeGreaterThan(1);
  await openReactor(page);
  await page.locator("button[data-ring=azure]").click();
  await page.locator("[data-testid=reactor-techs] [data-tech=cosmos-db]").click();
  await expect(page.getByTestId("reactor-uses")).toHaveText(`${cosmos.pods.length} projects use ${cosmos.name}`);
  await expect(page.getByTestId("reactor-project")).toHaveCount(cosmos.pods.length);
  await expect.poll(() => probe(page)).toMatchObject({ tech: "cosmos-db", lit: cosmos.docked });
  expect((await probe(page)).roads).toBeGreaterThanOrEqual(cosmos.docked.length + 1);
  await expect.poll(() => signs(page)).toContain(`${cosmos.pods.length} projects use ${cosmos.name}`);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#labs-tech=cosmos-db");
  // Six ring labels plus the count sign, every highlight within the L3 budget.
  expect(await signs(page)).toHaveLength(7);
  await expectRenderBudget(page);

  // The hash survives closing the drawer (the room URL goes back to the floor entry).
  await page.keyboard.press("Escape");
  await waitForPhase(page, "explore");
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#labs-tech=cosmos-db");

  await openReactor(page);
  await page.getByTestId("reactor-clear").click();
  await expect.poll(() => probe(page)).toMatchObject({ tech: null, lit: [] });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("");
  expect(await signs(page)).toHaveLength(6);
  expect(errors).toEqual([]);
});

test("a ring click drives to the reactor and opens the drawer on that ring", async ({ page }) => {
  await enterFloorRoute(page, "/en/labs");
  const stop = await page.evaluate(() => (window as unknown as RW).__hq.layouts.L3.stops!["L3:reactor"]);
  // West of the core on the ring road: the follow camera looks east at the rings.
  await driveTo(page, { x: stop.x - 13, z: 0 });
  await waitForFrames(page, 20);
  const ring = await visibleTarget(page, { kinds: ["station"] });
  expect(ring.id).toMatch(/^L3:station:reactor-/);
  const point = await targetPoint(page, ring.id);
  await page.mouse.click(point.x, point.y);
  await waitForRoom(page, "L3:reactor");
  const id = ring.id.slice("L3:station:reactor-".length);
  await expect(page.locator(`[data-testid=reactor-body] button[data-ring=${id}]`)).toHaveAttribute("aria-pressed", "true");
  const at = await page.evaluate(() => (window as unknown as { __hq: { rover: { x: number; z: number } } }).__hq.rover);
  expect(Math.hypot(at.x - stop.x, at.z - stop.z)).toBeLessThan(2);
});

test("Surprise me spins the rings and drives to one of the picked tech's pods", async ({ page }) => {
  await enterFloorRoute(page, "/en/labs");
  const next = await techOf(page, "next-js");
  await openReactor(page);
  await page.locator("button[data-ring=frontend]").click();
  await page.locator("[data-testid=reactor-techs] [data-tech=next-js]").click();
  await page.getByTestId("reactor-surprise").click();
  await expect.poll(async () => (await probe(page)).boost).toBeGreaterThan(1);
  await expect.poll(async () => (await probe(page)).surprise).not.toBeNull();
  const target = (await probe(page)).surprise!;
  expect(next.docked).toContain(target);
  await waitForRoom(page, `L3:${target}`, 150_000);
});

test("the #labs-tech deep link opens the reactor with that tech picked", async ({ page }) => {
  await asReturningVisitor(page);
  await page.goto("/en/labs?tier=lite#labs-tech=fastapi");
  await waitForHQ(page);
  await waitForRoom(page, "L3:reactor");
  await waitForSceneLive(page);
  const fastapi = await techOf(page, "fastapi");
  await expect(page.locator("[data-testid=reactor-body] button[data-ring=backend]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("reactor-selection")).toHaveAttribute("data-tech", "fastapi");
  await expect.poll(() => probe(page)).toMatchObject({ tech: "fastapi", lit: fastapi.docked });
  expect(page.url()).toContain("/en/labs?tier=lite#labs-tech=fastapi");
});

test("Cmd-K shows the projects using a tech in the tower", async ({ page }) => {
  await enterFloorRoute(page, "/en/labs");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("show projects using fastapi");
  await expect(page.getByRole("option").first()).toContainText("Show projects using FastAPI");
  await page.keyboard.press("Enter");
  await waitForRoom(page, "L3:reactor", 150_000);
  await expect.poll(async () => (await probe(page)).tech).toBe("fastapi");
});

test("reduced motion holds the rings still, Surprise me included", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await chooseMotion(page, "system");
  await enterFloorRoute(page, "/en/labs");
  const spin = () => page.evaluate(() => (window as unknown as RW).__hq.probes.spectacle["reactor.spin"]);
  await expect.poll(spin).toBeDefined();
  const before = await spin();
  await openReactor(page);
  await page.locator("[data-testid=reactor-techs] button").first().click();
  await page.getByTestId("reactor-surprise").click();
  await waitForFrames(page, 30);
  expect(await spin()).toBe(before);
});
