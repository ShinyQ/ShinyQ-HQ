/**
 * Compares two folders of PNG captures pixel by pixel inside Chromium (no image dependency).
 *   bun scripts/shot-diff.ts screenshots/delivery/before screenshots/delivery/after [--delta 24] [--max 0.005] [--only 3d-]
 * A pixel counts as changed when any RGB channel differs by more than --delta. Exits 1 when a pair
 * exceeds --max (ratio of changed pixels) or the sizes differ. Missing files on either side are listed.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string, fallback: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const [dirA, dirB] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  const delta = Number(flag("--delta", "24"));
  const max = Number(flag("--max", "0.005"));
  const only = flag("--only", "");
  const names = readdirSync(dirA).filter((n) => n.endsWith(".png") && n.startsWith(only)).sort();
  const missing = names.filter((n) => !readdirSync(dirB).includes(n));
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let failed = missing.length > 0;
  for (const name of names.filter((n) => !missing.includes(n))) {
    const a = `data:image/png;base64,${readFileSync(path.join(dirA, name)).toString("base64")}`;
    const b = `data:image/png;base64,${readFileSync(path.join(dirB, name)).toString("base64")}`;
    const r = await page.evaluate(
      async ({ a, b, delta }) => {
        const load = async (src: string) => {
          const img = new Image();
          img.src = src;
          await img.decode();
          return img;
        };
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        if (ia.width !== ib.width || ia.height !== ib.height) return { changed: -1, total: ia.width * ia.height };
        const read = (img: HTMLImageElement) => {
          const c = new OffscreenCanvas(img.width, img.height);
          const g = c.getContext("2d")!;
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, img.width, img.height).data;
        };
        const da = read(ia);
        const db = read(ib);
        let changed = 0;
        for (let i = 0; i < da.length; i += 4) {
          if (Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > delta) changed++;
        }
        return { changed, total: ia.width * ia.height };
      },
      { a, b, delta },
    );
    const ratio = r.changed < 0 ? 1 : r.changed / r.total;
    const over = ratio > max;
    failed ||= over;
    console.log(`${over ? "FAIL" : "ok  "} ${name.padEnd(40)} ${r.changed < 0 ? "size differs" : `${(ratio * 100).toFixed(3)}% (${r.changed} px)`}`);
  }
  for (const name of missing) console.log(`MISS ${name}`);
  await browser.close();
  process.exit(failed ? 1 : 0);
}

if (import.meta.main) void main();
