import { expect, test, type Page } from "@playwright/test";
import { enterFloorRoute } from "./hq";

/**
 * Unique floating holograms (owner decision 2026-10-23): each of L2, L3 and L4 fetches its hashed shapes JSON after
 * its first frame and swaps its type icons or kind holograms for the items' own; with `/shapes/*` unreachable the
 * fallback stays. Waits on the `__hq.probes.shapes` state, never on time.
 */

type ShapesWindow = {
  __hq: {
    probes: { shapes: Partial<Record<string, { state: string; unique: number }>> };
    render: { scene: { getObjectByName(name: string): SceneNode | undefined } | null };
  };
};
type SceneNode = { name: string; visible: boolean; isMesh?: boolean; children: SceneNode[]; traverse(cb: (o: SceneNode) => void): void };

const FLOORS = [
  { floor: "L2", path: "/en/journey", group: "career-rooms" },
  { floor: "L3", path: "/en/labs", group: "labs-pods" },
  { floor: "L4", path: "/en/library", group: "library-icons" },
] as const;

const probe = (page: Page, floor: string) => page.evaluate((f) => (window as unknown as ShapesWindow).__hq.probes.shapes[f] ?? null, floor);

/** Visible meshes of the HoloIcon batches under a floor group (L3 draws its holograms as one instanced mesh instead). */
const iconMeshes = (page: Page, group: string) =>
  page.evaluate((name) => {
    let count = 0;
    (window as unknown as ShapesWindow).__hq.render.scene?.getObjectByName(name)?.traverse((o) => {
      if (o.name === "holo-icon") for (const c of o.children) if (c.visible && c.isMesh) count += 1;
    });
    return count;
  }, group);

for (const { floor, path, group } of FLOORS) {
  test(`${floor} swaps in its unique holograms once the shapes load`, async ({ page }) => {
    const shapes = page.waitForResponse((r) => /\/shapes\/L\d\.[0-9a-f]{10}\.json$/.test(r.url()) && r.url().includes(`/${floor}.`));
    await enterFloorRoute(page, path);
    expect((await shapes).status()).toBe(200);
    await expect.poll(() => probe(page, floor), { timeout: 30_000 }).toMatchObject({ state: "shown" });
    expect((await probe(page, floor))!.unique).toBeGreaterThan(10);
    // The fallback batch is gone: one batch remains (lite: no halo).
    if (floor !== "L3") expect(await iconMeshes(page, group)).toBe(1);
  });
}

test("the type icons and kind holograms stay when /shapes/ is unreachable", async ({ page }) => {
  await page.route("**/shapes/**", (route) => route.abort());
  await enterFloorRoute(page, "/en/journey");
  await expect.poll(() => probe(page, "L2"), { timeout: 30_000 }).toMatchObject({ state: "failed" });
  expect(await iconMeshes(page, "career-rooms")).toBe(1);
});
