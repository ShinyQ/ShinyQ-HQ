import { expect, test, type Page, type Response } from "@playwright/test";
import { chunkName, kb, sum, type ChunkMap } from "../../scripts/perf-report";
import { B1_QUERY } from "../b1";
import { BYTES_3D_BUDGET } from "../budgets";
import { asReturningVisitor, openPage, waitForHQ, waitForPhase, waitForSceneLive } from "../hq";
import { writePerfEntry } from "./helpers";

/**
 * 3D bytes gate (SP6, appendix 08 section 2): the JavaScript a visitor downloads after the 3D gate,
 * gzip as served (scripts/serve-static.ts gzips like Cloudflare), on both tiers. Two cold contexts:
 * the Page View (`?tier=static`) and the 3D view until the scene runs and the network is quiet. Every
 * response the Page View did not fetch is 3D-path bytes: scripts are gated, fonts, JSON, CSS and
 * images are reported. The main path is measured with `?prefetch=off`; then each public on-demand floor
 * chunk (L3, L4, RF) is loaded on its own and held to its cap. The main path fails at `BYTES_3D_BUDGET.failAt`
 * (465.5 KB); main plus every public floor chunk (`BYTES_3D_BUDGET.sessionFloors`, what idle prefetch downloads in
 * a normal session) must stay under the session cap (`BYTES_3D_BUDGET.session`: full 494.4 KB, lite 478.7 KB).
 * B1 (the Engine Room) loads only for an unlocked session, so it is never part of that total: it is
 * measured in a second, unlocked session (`?unlock=b1&debug=1`) and held to its own cap. The L1 Agent Office chunk
 * (`__hq.office.load()`) is measured after the session floors and held to `BYTES_3D_BUDGET.office`, outside the session total;
 * its drawer body chunk (`__hq.office.loadBody()`, loaded on an office drawer open) is measured after it and held to
 * `BYTES_3D_BUDGET.officeBody`.
 */
test.describe.configure({ timeout: 150_000 });

type FloorChunkId = keyof typeof BYTES_3D_BUDGET.floors;
type FloorChunks = { __hq: { floorChunks?: { load: (id: string) => Promise<void> } } };

/** Bytes of the script chunks a floor load added on top of the Page View and the paths already counted; the loaded paths join `counted`. */
async function measureFloor(page: Page, floor: FloorChunkId, seen: Set<string>, counted: Set<string>): Promise<number> {
  const loaded = await recordTransfers(page, () => page.evaluate((f) => (window as unknown as FloorChunks).__hq.floorChunks!.load(f), floor), 2000);
  const bytes = loaded.filter((t) => t.type === "script" && !seen.has(t.path) && !counted.has(t.path)).reduce((n, t) => n + t.bytes, 0);
  for (const t of loaded) counted.add(t.path);
  return bytes;
}

type OfficeLoader = "load" | "loadBody";
type OfficeLoad = { __hq: { office?: Partial<Record<OfficeLoader, () => Promise<void>>> } };

/**
 * Bytes of an Agent Office chunk (`load`: the scene, `loadBody`: the drawer body) on top of the Page View, the main
 * path and the chunks already counted; null on a build without that loader.
 */
async function measureOffice(page: Page, loader: OfficeLoader, seen: Set<string>, counted: Set<string>): Promise<number | null> {
  if (!(await page.evaluate((l) => Boolean((window as unknown as OfficeLoad).__hq.office?.[l]), loader))) return null;
  const loaded = await recordTransfers(page, () => page.evaluate((l) => (window as unknown as OfficeLoad).__hq.office![l]!(), loader), 2000);
  const bytes = loaded.filter((t) => t.type === "script" && !seen.has(t.path) && !counted.has(t.path)).reduce((n, t) => n + t.bytes, 0);
  for (const t of loaded) counted.add(t.path);
  return bytes;
}

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
  // Proving that nothing more arrives is the one place a timed wait belongs (docs/agents/performance.md, writing 3D tests).
  while (Date.now() - last < quietMs) {
    if (Date.now() > deadline) throw new Error(`the network never went quiet for ${quietMs} ms`);
    await page.waitForTimeout(250);
  }
  page.off("response", onResponse);
  return (await Promise.all(pending)).filter((t): t is Transfer => t !== null);
}

for (const tier of ["lite", "full"] as const) {
  test(`3D JS after the gate stays under ${(BYTES_3D_BUDGET.failAt / 1024).toFixed(1)} KB gzip (${tier})`, async ({ browser }) => {
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
    const lockedMainPaths = new Set(mainPaths);
    const floors: Partial<Record<FloorChunkId, number>> = {};
    // false on a build without on-demand floor chunks (a main build in a before/after run).
    const hasChunks = await page.evaluate(() => Boolean((window as unknown as FloorChunks).__hq.floorChunks));
    if (hasChunks) {
      for (const floor of BYTES_3D_BUDGET.sessionFloors) floors[floor] = await measureFloor(page, floor, seen, mainPaths);
    }
    // The Agent Office (L1) loads when the rover heads into its wing (or on an office mission or drawer): its own cap, outside the session total.
    const office = await measureOffice(page, "load", seen, mainPaths);
    // Its drawer body is a second chunk, loaded only when an office drawer opens: incremental over the scene chunk.
    const officeBody = await measureOffice(page, "loadBody", seen, mainPaths);
    await context.close();

    // B1 only loads when unlocked. It is a near floor of the Lobby, so it may arrive during the main path even with
    // ?prefetch=off: B1's bytes are every script this session fetched that the locked main path and the Page View did not.
    let b1: number | null = null;
    if (hasChunks) {
      const unlocked = await browser.newContext();
      const upage = await unlocked.newPage();
      await asReturningVisitor(upage);
      const unlockedMain = await recordTransfers(upage, async () => {
        await upage.goto(`/en?tier=${tier}&prefetch=off&${B1_QUERY}`);
        await waitForHQ(upage);
        await waitForPhase(upage, "explore");
        await waitForSceneLive(upage);
      });
      const counted = new Set([...seen, ...lockedMainPaths]);
      const fromMain = unlockedMain.filter((t) => t.type === "script" && !counted.has(t.path));
      for (const t of fromMain) counted.add(t.path);
      b1 = fromMain.reduce((n, t) => n + t.bytes, 0) + (await measureFloor(upage, "B1", seen, counted));
      await unlocked.close();
    }

    const js: ChunkMap = {};
    const other: ChunkMap = {};
    for (const t of transfers) {
      if (seen.has(t.path)) continue;
      // troika fetches its fonts with XHR and the L1 logo atlas is fetched for createImageBitmap, so the file name
      // tells fonts and images apart from JSON.
      const kind = /\.(woff2?|ttf|otf)$/.test(t.path) ? "font" : /\.(webp|png|jpe?g|avif|gif|svg)$/.test(t.path) ? "image" : (KIND[t.type] ?? "other");
      if (kind === "js") js[chunkName(t.path)] = (js[chunkName(t.path)] ?? 0) + t.bytes;
      else other[kind] = (other[kind] ?? 0) + t.bytes;
    }
    const total = sum(js);
    const floorsTotal = Object.values(floors).reduce((n, bytes) => n + bytes, 0);
    const sessionTotal = total + floorsTotal;
    writePerfEntry({ kind: "bytes3d", tier, js, other, ...(hasChunks ? { floors: { ...floors, ...(b1 === null ? {} : { B1: b1 }) }, sessionTotal } : {}), ...(office === null ? {} : { office }), ...(officeBody === null ? {} : { officeBody }) });
    console.log(`3D JS after the gate (${tier}): ${kb(total)} gzip in ${Object.keys(js).length} chunks; other ${JSON.stringify(other)}`);
    if (hasChunks) console.log(`3D JS session total (${tier}): ${kb(sessionTotal)} gzip (main ${kb(total)} + public floor chunks ${kb(floorsTotal)}, B1 excluded, session cap ${kb(BYTES_3D_BUDGET.session[tier])})`);
    for (const [floor, bytes] of Object.entries(floors)) console.log(`floor chunk ${floor} (${tier}): ${kb(bytes)} gzip (cap ${kb(BYTES_3D_BUDGET.floors[floor as FloorChunkId])})`);
    if (b1 !== null) console.log(`floor chunk B1 (${tier}, unlocked session): ${kb(b1)} gzip (cap ${kb(BYTES_3D_BUDGET.floors.B1)}), not in the session total`);
    if (office !== null) console.log(`Agent Office chunk (${tier}): ${kb(office)} gzip (cap ${kb(BYTES_3D_BUDGET.office)}), not in the session total`);
    if (officeBody !== null) console.log(`Agent Office drawer body (${tier}, on drawer open): ${kb(officeBody)} gzip (cap ${kb(BYTES_3D_BUDGET.officeBody)}), over the scene chunk`);

    if (tier === "full" && postPasses !== null) expect(postPasses, "the full-tier composer never rendered (postprocessing chunk missing)").toBeGreaterThan(0);
    expect(total, "no 3D JavaScript measured: did the gate load the 3D chunk?").toBeGreaterThan(BYTES_3D_BUDGET.minExpected);
    expect(total, `3D JS ${kb(total)} is over the ${kb(BYTES_3D_BUDGET.failAt)} CI budget (spec ceiling ${kb(BYTES_3D_BUDGET.spec)})`).toBeLessThan(BYTES_3D_BUDGET.failAt);
    for (const [floor, bytes] of Object.entries(floors)) {
      const cap = BYTES_3D_BUDGET.floors[floor as FloorChunkId];
      expect(bytes, `${floor} chunk: did __hq.floorChunks.load fetch any script?`).toBeGreaterThan(0);
      expect(bytes, `${floor} chunk ${kb(bytes)} is over its ${kb(cap)} cap`).toBeLessThan(cap);
    }
    if (b1 !== null) {
      expect(b1, "B1 chunk: did __hq.floorChunks.load fetch any script in an unlocked session?").toBeGreaterThan(0);
      expect(b1, `B1 chunk ${kb(b1)} is over its ${kb(BYTES_3D_BUDGET.floors.B1)} cap`).toBeLessThan(BYTES_3D_BUDGET.floors.B1);
    }
    if (office !== null) {
      expect(office, "Agent Office chunk: did __hq.office.load fetch any script?").toBeGreaterThan(0);
      expect(office, `Agent Office chunk ${kb(office)} is over its ${kb(BYTES_3D_BUDGET.office)} cap`).toBeLessThan(BYTES_3D_BUDGET.office);
    }
    if (officeBody !== null) {
      expect(officeBody, "Agent Office drawer body: did __hq.office.loadBody fetch any script?").toBeGreaterThan(0);
      expect(officeBody, `Agent Office drawer body ${kb(officeBody)} is over its ${kb(BYTES_3D_BUDGET.officeBody)} cap`).toBeLessThan(BYTES_3D_BUDGET.officeBody);
    }
    if (hasChunks) expect(sessionTotal, `main + floor chunks ${kb(sessionTotal)} is over the ${kb(BYTES_3D_BUDGET.session[tier])} session cap (${tier})`).toBeLessThan(BYTES_3D_BUDGET.session[tier]);
  });
}
