import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";

/**
 * Before/after screenshot captures and a pixel diff that runs in Chromium (canvas), so no image
 * library is needed. Each capture stores the PNG plus the boxes of the elements the change is
 * allowed to touch; the diff fails when pixels change outside those boxes (R5 P10, reusable).
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShotOptions {
  /** `page`: full page (capped at 8000 px tall), `viewport`: what is on screen, `element`: one locator. */
  kind: "page" | "viewport" | "element";
  element?: Locator;
  /** Selectors of the elements this change may repaint (empty: the shot must not change). */
  changes?: readonly string[];
  /** Extra boxes the change may repaint, in the PNG's pixel space (3D content has no selector). */
  regions?: readonly Box[];
}

/** SwiftShader cannot capture very tall pages (the Journey), so full captures stop here. */
const MAX_HEIGHT = 8_000;

/** Saves `<dir>/<name>.png` and `<dir>/<name>.json` (`{ regions }` in the PNG's pixel space). */
export async function captureShot(page: Page, dir: string, name: string, { kind, element, changes = [], regions: extra = [] }: ShotOptions) {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  let origin = { x: 0, y: 0 };
  if (kind === "element") {
    const box = await element!.boundingBox();
    origin = { x: box!.x, y: box!.y };
    await element!.screenshot({ path: file, animations: "disabled" });
  } else if (kind === "page") {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const width = page.viewportSize()!.width;
    await page.screenshot({ path: file, fullPage: true, animations: "disabled", clip: { x: 0, y: 0, width, height: Math.min(height, MAX_HEIGHT) } });
  } else {
    await page.screenshot({ path: file, animations: "disabled" });
  }
  const regions = await page.evaluate(
    ({ selectors, docCoords, origin }) =>
      selectors
        .flatMap((selector) =>
          [...document.querySelectorAll(selector)].map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x + (docCoords ? window.scrollX : 0) - origin.x, y: r.y + (docCoords ? window.scrollY : 0) - origin.y, w: r.width, h: r.height };
          }),
        )
        .filter((r) => r.w > 0 && r.h > 0),
    { selectors: [...changes], docCoords: kind === "page", origin },
  );
  writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify({ regions: [...regions, ...extra] }, null, 2)}\n`);
}

export interface DiffRow {
  name: string;
  width: number;
  height: number;
  /** Pixels whose largest channel difference exceeds the tolerance. */
  changed: number;
  /** Changed pixels outside every allowed region (padded). */
  outside: number;
  /** `outside / (width * height)`. */
  ratio: number;
  /** The capture listed elements the change may repaint, so it must differ somewhere. */
  expected: boolean;
  /** Set when the two PNGs differ in size (a layout shift): the shot fails. */
  sizeMismatch?: string;
}

export interface DiffOptions {
  /** Largest per-channel difference (0 to 255) that still counts as equal; absorbs anti-aliasing. */
  tolerance: number;
  /** Padding around each allowed region, for glows and outlines (px). */
  pad: number;
}

/** Diffs one pair in the page; returns counts and a PNG (after, dimmed; yellow = allowed change, red = unexpected). */
export async function diffPair(page: Page, before: Buffer, after: Buffer, regions: Box[], { tolerance, pad }: DiffOptions) {
  return page.evaluate(
    async ({ a, b, regions, tolerance, pad }) => {
      const load = async (data: string) => createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) {
        return { width: ib.width, height: ib.height, changed: -1, outside: -1, png: "", sizeMismatch: `${ia.width}x${ia.height} -> ${ib.width}x${ib.height}` };
      }
      const { width, height } = ia;
      const boxes = regions.map((r) => ({ x0: r.x - pad, y0: r.y - pad, x1: r.x + r.w + pad, y1: r.y + r.h + pad }));
      const allowed = (x: number, y: number) => boxes.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
      const BAND = 512;
      const ca = new OffscreenCanvas(width, BAND).getContext("2d", { willReadFrequently: true })!;
      const cb = new OffscreenCanvas(width, BAND).getContext("2d", { willReadFrequently: true })!;
      const out = new OffscreenCanvas(width, height);
      const co = out.getContext("2d")!;
      let changed = 0;
      let outside = 0;
      for (let y0 = 0; y0 < height; y0 += BAND) {
        const h = Math.min(BAND, height - y0);
        ca.clearRect(0, 0, width, BAND);
        cb.clearRect(0, 0, width, BAND);
        ca.drawImage(ia, 0, y0, width, h, 0, 0, width, h);
        cb.drawImage(ib, 0, y0, width, h, 0, 0, width, h);
        const da = ca.getImageData(0, 0, width, h).data;
        const img = cb.getImageData(0, 0, width, h);
        const db = img.data;
        for (let i = 0; i < db.length; i += 4) {
          const diff = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
          if (diff > tolerance) {
            changed++;
            const p = i / 4;
            const ok = allowed(p % width, y0 + Math.floor(p / width));
            if (!ok) outside++;
            db[i] = 255;
            db[i + 1] = ok ? 200 : 0;
            db[i + 2] = 0;
            db[i + 3] = 255;
          } else {
            db[i] = db[i] * 0.3;
            db[i + 1] = db[i + 1] * 0.3;
            db[i + 2] = db[i + 2] * 0.3;
          }
        }
        co.putImageData(img, 0, y0);
      }
      const blob = await out.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { width, height, changed, outside, png: btoa(binary), sizeMismatch: undefined as string | undefined };
    },
    { a: before.toString("base64"), b: after.toString("base64"), regions, tolerance, pad },
  );
}

/** Diffs every `<name>.png` present in both folders; writes `<outDir>/<name>.diff.png` and `<outDir>/report.json`. */
export async function diffShotDirs(page: Page, beforeDir: string, afterDir: string, outDir: string, options: DiffOptions): Promise<DiffRow[]> {
  mkdirSync(outDir, { recursive: true });
  await page.setContent("<!doctype html><title>diff</title>");
  const rows: DiffRow[] = [];
  for (const file of readdirSync(afterDir).filter((f) => f.endsWith(".png")).sort()) {
    const name = file.slice(0, -4);
    if (!existsSync(path.join(beforeDir, file))) throw new Error(`no before capture for ${name}`);
    const meta = (dir: string): Box[] => JSON.parse(readFileSync(path.join(dir, `${name}.json`), "utf8")).regions;
    const regions = [...meta(beforeDir), ...meta(afterDir)];
    const r = await diffPair(page, readFileSync(path.join(beforeDir, file)), readFileSync(path.join(afterDir, file)), regions, options);
    if (r.png) writeFileSync(path.join(outDir, `${name}.diff.png`), Buffer.from(r.png, "base64"));
    rows.push({
      name,
      width: r.width,
      height: r.height,
      changed: r.changed,
      outside: r.outside,
      ratio: r.outside < 0 ? 1 : r.outside / (r.width * r.height),
      expected: regions.length > 0,
      ...(r.sizeMismatch ? { sizeMismatch: r.sizeMismatch } : {}),
    });
  }
  writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(rows, null, 2)}\n`);
  return rows;
}
