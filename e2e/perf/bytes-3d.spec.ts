import { expect, test, type Page, type Response } from "@playwright/test";
import { chunkName, kb, sum, type ChunkMap } from "../../scripts/perf-report";
import { BYTES_3D_BUDGET } from "../budgets";
import { asReturningVisitor, openPage, waitForHQ, waitForPhase, waitForSceneLive } from "../hq";
import { writePerfEntry } from "./helpers";

/**
 * 3D bytes gate (SP6, appendix 08 section 2): the JavaScript a visitor downloads after the 3D gate,
 * gzip as served (scripts/serve-static.ts gzips like Cloudflare), on both tiers. Two cold contexts:
 * the Page View (`?tier=static`) and the 3D view until the scene runs and the network is quiet. Every
 * response the Page View did not fetch is 3D-path bytes: scripts are gated, fonts, JSON, CSS and
 * images are reported. The main path is measured with `?prefetch=off`; then each on-demand floor chunk
 * (L3, L4, RF) is loaded on its own and held to its cap. The main path fails at 450 KB; main plus every
 * floor chunk (what idle prefetch downloads in a normal session) must stay under the session cap
 * (`BYTES_3D_BUDGET.session`: full 470 KB, lite 446.4 KB).
 */
test.describe.configure({ timeout: 150_000 });

type FloorChunkId = keyof typeof BYTES_3D_BUDGET.floors;

interface Transfer {
  path: string;
  type: string;
  bytes: number;
}

/** Playwright resource types to report keys. */
const KIND: Record<string, string> = { script: "js", stylesheet: "css", font: "font", fetch: "json", xhr: "json", image: "image" };

/** Same-origin responses with their encoded body size, from `load` until no response arrived for `quietMs`. */
async function recordTransfers(page: Page, load: () => Promise<unknown>, quietMs = 3000, timeout = 60_000): Promise<Transfer[]> {
  const pending: Promise<Transfer | null>[] = [];
  let last = Date.now();
  const onResponse = (response: Response) => {
    last = Date.now();
    const url = new URL(response.url());
    if (url.hostname !== "127.0.0.1") return;
    const request = response.request();
    pending.push(
      request.sizes().then(
        (sizes) => ({ path: url.pathname, type: request.resourceType(), bytes: sizes.responseBodySize }),
        () => null,
      ),
    );
  };
  page.on("response", onResponse);
  await load();
  const deadline = Date.now() + timeout;
  // Proving that nothing more arrives is the one place a timed wait belongs (AGENTS.md, writing 3D tests).
  while (Date.now() - last < quietMs) {
    if (Date.now() > deadline) throw new Error(`the network never went quiet for ${quietMs} ms`);
    await page.waitForTimeout(250);
  }
  page.off("response", onResponse);
  return (await Promise.all(pending)).filter((t): t is Transfer => t !== null);
}

for (const tier of ["lite", "full"] as const) {
  test(`3D JS after the gate stays under ${BYTES_3D_BUDGET.failAt / 1024} KB gzip (${tier})`, async ({ browser }) => {
    const pageView = await browser.newContext();
    const pv = await pageView.newPage();
    // Longer quiet window: the Page View loads some chunks on idle (Ask status, HUD index), which a starved
    // CPU can delay past 3 s; any it missed would count as 3D bytes.
    const pageViewTransfers = await recordTransfers(pv, () => openPage(pv, "/en?tier=static"), 6000);
    await pageView.close();

    const context = await browser.newContext();
    const page = await context.newPage();
    await asReturningVisitor(page);
    const transfers = await recordTransfers(page, async () => {
      // ?prefetch=off: the main path only; floor chunks are measured one by one below.
      await page.goto(`/en?tier=${tier}&prefetch=off`);
      await waitForHQ(page);
      await waitForPhase(page, "explore");
      await waitForSceneLive(page);
    });
    // null on a build without the counters (a main build in a before/after run).
    const postPasses = await page.evaluate(() => (window as unknown as { __hq: { perf?: { stats: { postCalls: number } } } }).__hq.perf?.stats.postCalls ?? null);

    const seen = new Set(pageViewTransfers.map((t) => t.path));
    const mainPaths = new Set(transfers.map((t) => t.path));
    const floors: Partial<Record<FloorChunkId, number>> = {};
    // false on a build without on-demand floor chunks (a main build in a before/after run).
    const hasChunks = await page.evaluate(() => Boolean((window as unknown as { __hq: { floorChunks?: unknown } }).__hq.floorChunks));
    if (hasChunks) {
      for (const floor of Object.keys(BYTES_3D_BUDGET.floors) as FloorChunkId[]) {
        const loaded = await recordTransfers(
          page,
          () => page.evaluate((f) => (window as unknown as { __hq: { floorChunks: { load: (id: string) => Promise<void> } } }).__hq.floorChunks.load(f), floor),
          2000,
        );
        floors[floor] = loaded.filter((t) => t.type === "script" && !seen.has(t.path) && !mainPaths.has(t.path)).reduce((n, t) => n + t.bytes, 0);
        for (const t of loaded) mainPaths.add(t.path);
      }
    }
    await context.close();

    const js: ChunkMap = {};
    const other: ChunkMap = {};
    for (const t of transfers) {
      if (seen.has(t.path)) continue;
      // troika fetches its fonts with XHR, so the file name tells fonts apart from JSON.
      const kind = /\.(woff2?|ttf|otf)$/.test(t.path) ? "font" : (KIND[t.type] ?? "other");
      if (kind === "js") js[chunkName(t.path)] = (js[chunkName(t.path)] ?? 0) + t.bytes;
      else other[kind] = (other[kind] ?? 0) + t.bytes;
    }
    const total = sum(js);
    const floorsTotal = Object.values(floors).reduce((n, bytes) => n + bytes, 0);
    const sessionTotal = total + floorsTotal;
    writePerfEntry({ kind: "bytes3d", tier, js, other, ...(hasChunks ? { floors, sessionTotal } : {}) });
    console.log(`3D JS after the gate (${tier}): ${kb(total)} gzip in ${Object.keys(js).length} chunks; other ${JSON.stringify(other)}`);
    if (hasChunks) console.log(`3D JS session total (${tier}): ${kb(sessionTotal)} gzip (main ${kb(total)} + floor chunks ${kb(floorsTotal)}, session cap ${kb(BYTES_3D_BUDGET.session[tier])})`);
    for (const [floor, bytes] of Object.entries(floors)) console.log(`floor chunk ${floor} (${tier}): ${kb(bytes)} gzip (cap ${kb(BYTES_3D_BUDGET.floors[floor as FloorChunkId])})`);

    if (tier === "full" && postPasses !== null) expect(postPasses, "the full-tier composer never rendered (postprocessing chunk missing)").toBeGreaterThan(0);
    expect(total, "no 3D JavaScript measured: did the gate load the 3D chunk?").toBeGreaterThan(BYTES_3D_BUDGET.minExpected);
    expect(total, `3D JS ${kb(total)} is over the ${kb(BYTES_3D_BUDGET.failAt)} CI budget (spec ceiling ${kb(BYTES_3D_BUDGET.spec)})`).toBeLessThan(BYTES_3D_BUDGET.failAt);
    for (const [floor, bytes] of Object.entries(floors)) {
      const cap = BYTES_3D_BUDGET.floors[floor as FloorChunkId];
      expect(bytes, `${floor} chunk: did __hq.floorChunks.load fetch any script?`).toBeGreaterThan(0);
      expect(bytes, `${floor} chunk ${kb(bytes)} is over its ${kb(cap)} cap`).toBeLessThan(cap);
    }
    if (hasChunks) expect(sessionTotal, `main + floor chunks ${kb(sessionTotal)} is over the ${kb(BYTES_3D_BUDGET.session[tier])} session cap (${tier})`).toBeLessThan(BYTES_3D_BUDGET.session[tier]);
  });
}
