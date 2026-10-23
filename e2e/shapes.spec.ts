import { expect, test, type Page } from "@playwright/test";
import { iconMesh, type Stroke } from "../src/experience/fx/holoIcons";
import { enterFloorRoute, waitForFrames } from "./hq";

/**
 * Unique floating holograms (owner decision 2026-10-23): each of L2, L3 and L4 fetches its hashed shapes JSON after
 * its first frame and swaps its type icons or kind holograms for the items' own; with `/shapes/*` unreachable the
 * fallback stays. Reads the scene (what the floor draws), waits on state, never on time.
 */

type Node = { name: string; visible: boolean; isMesh?: boolean; isInstancedMesh?: boolean; count?: number; children: Node[]; geometry?: { attributes: { position: { count: number } } }; instanceMatrix?: { count: number }; traverse(cb: (o: Node) => void): void };
type SceneWindow = { __hq: { render: { scene: { getObjectByName(name: string): Node | undefined } | null }; interact: { items: { id: string }[] } } };
type Shapes = { items?: Record<string, unknown[]>; icons?: { strokes: Stroke[] }[] };

const SHAPES = (floor: string) => (r: { url(): string }) => new RegExp(`/shapes/${floor}\\.[0-9a-f]{10}\\.json$`).test(r.url());

/** Vertex counts of the visible HoloIcon batches under a floor group. */
const iconBatches = (page: Page, group: string) =>
  page.evaluate((name) => {
    const out: number[] = [];
    (window as unknown as SceneWindow).__hq.render.scene?.getObjectByName(name)?.traverse((o) => {
      if (o.name === "holo-icon" && o.visible) out.push(...o.children.filter((c) => c.visible && c.isMesh).map((c) => c.geometry!.attributes.position.count));
    });
    return out;
  }, group);

/** Boxes the L3 pod hologram mesh draws (the instanced mesh with room for every pod's largest hologram). */
const podBoxes = (page: Page) =>
  page.evaluate(() => {
    let best: Node | null = null;
    (window as unknown as SceneWindow).__hq.render.scene?.getObjectByName("labs-pods")?.traverse((o) => {
      if (o.isInstancedMesh && (!best || o.instanceMatrix!.count > best.instanceMatrix!.count)) best = o;
    });
    return (best as Node | null)?.count ?? 0;
  });

/** Vertices of a batch of placed icons (the lite tier draws no halo). */
const batchVertices = (icons: { strokes: Stroke[] }[]) => icons.reduce((n, i) => n + iconMesh(i.strokes, 1.5).positions.length / 3, 0);

for (const { floor, path, group } of [
  { floor: "L2", path: "/en/journey", group: "career-rooms" },
  { floor: "L4", path: "/en/library", group: "library-icons" },
] as const) {
  test(`${floor} swaps in its unique icons once the shapes load`, async ({ page }) => {
    const response = page.waitForResponse(SHAPES(floor));
    await enterFloorRoute(page, path);
    const file = (await (await response).json()) as Shapes;
    expect(file.icons!.length).toBeGreaterThan(10);
    // After the crossfade one batch remains (lite: no halo), drawing exactly the file's icons.
    await expect.poll(() => iconBatches(page, group), { timeout: 30_000 }).toEqual([batchVertices(file.icons!)]);
  });
}

test("L3 swaps in its pod sculptures once the shapes load", async ({ page }) => {
  const response = page.waitForResponse(SHAPES("L3"));
  await enterFloorRoute(page, "/en/labs");
  const file = (await (await response).json()) as Shapes;
  expect(Object.keys(file.items!).length).toBeGreaterThan(10);
  const docked = await page.evaluate(() => (window as unknown as SceneWindow).__hq.interact.items.map((i) => i.id).filter((id) => id.startsWith("L3:door:") && id !== "L3:door:ops").map((id) => id.slice(8)));
  expect(docked.length).toBeGreaterThan(10);
  await expect.poll(() => podBoxes(page), { timeout: 30_000 }).toBe(docked.reduce((n, slug) => n + file.items![slug].length, 0));
});

test("the type icons stay when /shapes/ is unreachable", async ({ page }) => {
  await page.route("**/shapes/**", (route) => route.abort());
  const failed = page.waitForEvent("requestfailed", SHAPES("L2"));
  await enterFloorRoute(page, "/en/journey");
  await failed;
  const fallback = await iconBatches(page, "career-rooms");
  expect(fallback).toHaveLength(1);
  await waitForFrames(page, 30);
  expect(await iconBatches(page, "career-rooms")).toEqual(fallback);
});
