import { gzipSync } from "node:zlib";
import { expect, test, type Response } from "@playwright/test";
import { kb } from "../../scripts/perf-report";
import { GUIDE_READER_BUDGET } from "../budgets";
import { routeGuides } from "../fixtures/guide-pdf";
import { openPage } from "../hq";

/**
 * Study guide reader bytes (L4 study guides PR 1): the JavaScript the Read click downloads, gzip-sized with zlib
 * from the response bodies, split into the reader (the dialog and reader chunks plus pdf.js, on the main thread)
 * and the pdf.js worker (the Turbopack worker entry plus every chunk it lists in its `#params`). Neither is on the
 * page's initial load: no script before the click carries pdf.js.
 */
test.describe.configure({ timeout: 120_000 });

interface Js {
  path: string;
  body: Buffer;
}

const isJs = (path: string) => /\.m?js$/.test(path);
const gzip = (files: readonly Js[]) => files.reduce((n, f) => n + gzipSync(f.body).length, 0);

test("the study guide reader stays under its chunk and worker caps, off the page's initial load", async ({ page }) => {
  await routeGuides(page);
  let clicked = false;
  const before: Promise<Js | null>[] = [];
  const after: Promise<Js | null>[] = [];
  const workerPaths = new Set<string>();
  const bodyOf = async (response: Response): Promise<Js | null> => {
    const url = new URL(response.url());
    if (url.hostname !== "127.0.0.1" || !isJs(url.pathname)) return null;
    // A module worker's entry script reports no body to the page: fetch the same URL instead.
    const body = await response.body().catch(() => page.request.get(response.url()).then((r) => r.body()));
    return { path: url.pathname, body };
  };
  page.on("response", (response) => (clicked ? after : before).push(bodyOf(response)));
  page.on("worker", (worker) => {
    const url = new URL(worker.url());
    workerPaths.add(url.pathname);
    // Turbopack's worker entry lists the chunks it imports in its hash: `#params=[[chunk paths], ...]`.
    const params = new URLSearchParams(url.hash.slice(1)).get("params");
    const [chunks] = params ? (JSON.parse(params) as [string[]]) : [[]];
    for (const chunk of chunks) workerPaths.add(new URL(chunk, url).pathname);
  });

  await openPage(page, "/en/library?tier=static#guides");
  await page.waitForLoadState("networkidle");
  const initial = (await Promise.all(before)).filter((f): f is Js => f !== null);
  expect(initial.length).toBeGreaterThan(0);
  for (const f of initial) expect(/pdfjs|pdf\.worker/.test(f.path) || f.body.includes("pdfjs"), `${f.path} carries pdf.js before the Read click`).toBe(false);

  clicked = true;
  await page.locator("#guides").getByTestId("guide-read").first().click();
  await expect(page.locator('[data-testid="guide-page"][data-page="1"]')).toHaveAttribute("data-rendered", "true", { timeout: 60_000 });
  const loaded = (await Promise.all(after)).filter((f): f is Js => f !== null);

  expect(workerPaths.size, "the pdf.js worker never started").toBeGreaterThan(0);
  const worker = loaded.filter((f) => workerPaths.has(f.path));
  const reader = loaded.filter((f) => !workerPaths.has(f.path));
  expect(worker.some((f) => f.body.includes("pdf.worker")), "no worker chunk carries the pdf.js worker").toBe(true);
  expect(reader.some((f) => f.body.includes("pdfjs")), "no reader chunk carries pdf.js").toBe(true);

  const readerBytes = gzip(reader);
  const workerBytes = gzip(worker);
  console.log(`study guide reader: ${kb(readerBytes)} gzip in ${reader.length} chunks (cap ${kb(GUIDE_READER_BUDGET.chunk)})`);
  console.log(`study guide worker: ${kb(workerBytes)} gzip in ${worker.length} chunks (cap ${kb(GUIDE_READER_BUDGET.worker)})`);
  expect(readerBytes).toBeLessThan(GUIDE_READER_BUDGET.chunk);
  expect(workerBytes).toBeLessThan(GUIDE_READER_BUDGET.worker);
});
