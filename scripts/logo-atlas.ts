/**
 * One prebuilt logo atlas for the L1 skills and certification walls (perf PR D, owner item 5): the walls
 * load one content-hashed WebP instead of fetching every logo under public/tech and drawing it into a
 * canvas at runtime. Each logo is drawn by headless Chromium with the exact canvas code the runtime used
 * (128 px cells, 6% padding, contain fit, centered) and Chrome's GPU raster on macOS, so the cells match
 * what Chrome drew before; the canvas pixels (straight alpha, as WebGL received them) are stored as
 * lossless WebP.
 *
 *   bun scripts/logo-atlas.ts          regenerate public/atlas/logos.<hash>.webp and src/experience/logo-atlas.json
 *   bun scripts/logo-atlas.ts --check  fail when the committed atlas misses a logo or a logo file changed (bun run build)
 *
 * Generated files are committed (like scripts/troika-fonts.ts): the build needs no browser, the dev
 * server serves them as is, and the output only changes when a wall logo does.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildExperienceData } from "@/content/experience";
import { ATLAS_CELL, atlasLayout, atlasPad, wallLogoSrcs, type AtlasLayout } from "@/experience/floors/lobby/logoAtlas";

const root = process.cwd();
const PUBLIC = path.join(root, "public");
const OUT = path.join(PUBLIC, "atlas");
const MANIFEST = path.join(root, "src", "experience", "logo-atlas.json");

export interface LogoAtlasManifest extends AtlasLayout {
  /** Public URL of the atlas image (content-hashed name). */
  file: string;
  pad: number;
  /** Hash of the cell size, padding and every source logo (path and bytes), to spot a stale atlas. */
  sources: string;
}

const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/** The atlas layout of today's content: the same logo order the walls index into. */
export function expectedLayout(): AtlasLayout {
  const data = buildExperienceData("en", { L1: "Lobby", L2: "Career", L3: "Labs", L4: "Library", RF: "Roof" });
  return atlasLayout(wallLogoSrcs(data), ATLAS_CELL);
}

export function sourcesHash(layout: AtlasLayout, publicDir = PUBLIC): string {
  const h = createHash("sha256").update(`${layout.cell}:${atlasPad(layout.cell)}:${layout.cols}x${layout.rows}\n`);
  for (const src of layout.srcs) {
    const file = path.join(publicDir, src);
    if (!existsSync(file)) throw new Error(`logo ${src} is missing under public/`);
    h.update(`${src}\n`).update(readFileSync(file)).update("\n");
  }
  return h.digest("hex").slice(0, 12);
}

/** Problems with the committed atlas against today's content and logo files; empty when it is fresh. */
export function atlasProblems(manifest: LogoAtlasManifest, publicDir = PUBLIC): string[] {
  const layout = expectedLayout();
  const problems: string[] = [];
  if (JSON.stringify(manifest.srcs) !== JSON.stringify(layout.srcs)) problems.push("the wall logos changed (srcs differ)");
  if (manifest.cols !== layout.cols || manifest.rows !== layout.rows || manifest.cell !== layout.cell || manifest.pad !== atlasPad(layout.cell)) problems.push("the atlas grid changed");
  if (problems.length === 0 && manifest.sources !== sourcesHash(layout, publicDir)) problems.push("a logo file changed (sources hash differs)");
  const file = path.join(publicDir, manifest.file);
  if (!existsSync(file)) problems.push(`${manifest.file} is missing`);
  else if (!manifest.file.includes(`.${sha(readFileSync(file)).slice(0, 10)}.`)) problems.push(`${manifest.file} does not match its content hash`);
  return problems;
}

export async function rasterize(layout: AtlasLayout): Promise<Buffer> {
  const { chromium } = await import("@playwright/test");
  // GPU raster, as Chrome draws a canvas on a visitor's machine (and the visual gate on macOS, e2e/visual-gate.spec.ts);
  // elsewhere the suite's SwiftShader flags (playwright.config.ts) and Skia's software raster. They differ only in the
  // anti-aliasing of SVG edges, so regenerate on macOS when you can.
  const gpu = process.platform === "darwin" && process.env.LOGO_ATLAS_GPU !== "off";
  const args = gpu ? ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  const browser = await chromium.launch({ args });
  try {
    const page = await browser.newPage();
    await page.route("http://atlas.local/**", async (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === "/") return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>atlas</title>" });
      const file = path.join(PUBLIC, decodeURIComponent(pathname));
      if (!file.startsWith(PUBLIC) || !existsSync(file)) return route.fulfill({ status: 404 });
      const type = file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".webp") ? "image/webp" : file.endsWith(".png") ? "image/png" : "application/octet-stream";
      return route.fulfill({ status: 200, contentType: type, body: readFileSync(file) });
    });
    await page.goto("http://atlas.local/");
    const result = await page.evaluate(
      async ({ srcs, cols, rows, cell, pad }) => {
        // The runtime atlas code, unchanged (LogoQuads.tsx useAtlasTexture before the prebuilt atlas).
        const canvas = document.createElement("canvas");
        canvas.width = cols * cell;
        canvas.height = rows * cell;
        const ctx = canvas.getContext("2d")!;
        const failed: string[] = [];
        await Promise.all(
          srcs.map(
            (src, i) =>
              new Promise<void>((resolve) => {
                const img = new Image();
                img.decoding = "async";
                img.onload = () => {
                  const x = (i % cols) * cell;
                  const y = Math.floor(i / cols) * cell;
                  const box = cell - pad * 2;
                  const scale = Math.min(box / (img.naturalWidth || box), box / (img.naturalHeight || box));
                  const w = (img.naturalWidth || box) * scale;
                  const h = (img.naturalHeight || box) * scale;
                  ctx.drawImage(img, x + (cell - w) / 2, y + (cell - h) / 2, w, h);
                  resolve();
                };
                img.onerror = () => {
                  failed.push(src);
                  resolve();
                };
                img.src = src;
              }),
          ),
        );
        return { png: canvas.toDataURL("image/png"), failed };
      },
      { srcs: layout.srcs, cols: layout.cols, rows: layout.rows, cell: layout.cell, pad: atlasPad(layout.cell) },
    );
    if (result.failed.length > 0) throw new Error(`logos failed to load: ${result.failed.join(", ")}`);
    return Buffer.from(result.png.replace(/^data:image\/png;base64,/, ""), "base64");
  } finally {
    await browser.close();
  }
}

async function generate() {
  const sharp = (await import("sharp")).default;
  const layout = expectedLayout();
  const sources = sourcesHash(layout);
  const png = await rasterize(layout);
  // exact: keep the RGB of transparent pixels, which texture filtering blends into logo edges. effort 6 with
  // quality 100 is the slowest, smallest lossless setting (cwebp -z 9).
  const webp = await sharp(png).webp({ lossless: true, exact: true, effort: 6, quality: 100 }).toBuffer();
  const [a, b] = await Promise.all([sharp(png).ensureAlpha().raw().toBuffer(), sharp(webp).ensureAlpha().raw().toBuffer()]);
  if (!a.equals(b)) throw new Error("the WebP atlas does not round-trip the canvas pixels");
  mkdirSync(OUT, { recursive: true });
  const name = `logos.${sha(webp).slice(0, 10)}.webp`;
  writeFileSync(path.join(OUT, name), webp);
  for (const f of readdirSync(OUT)) if (f !== name) rmSync(path.join(OUT, f));
  const manifest: LogoAtlasManifest = { file: `/atlas/${name}`, cols: layout.cols, rows: layout.rows, cell: layout.cell, pad: atlasPad(layout.cell), sources, srcs: layout.srcs };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  const sourceBytes = layout.srcs.reduce((n, src) => n + readFileSync(path.join(PUBLIC, src)).length, 0);
  console.log(`${manifest.file}: ${layout.srcs.length} logos, ${layout.cols}x${layout.rows} cells of ${layout.cell} px, ${webp.length} bytes (sources ${sourceBytes} bytes)`);
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    const problems = existsSync(MANIFEST) ? atlasProblems(JSON.parse(readFileSync(MANIFEST, "utf8")) as LogoAtlasManifest) : ["src/experience/logo-atlas.json is missing"];
    if (problems.length > 0) {
      console.error(`logo atlas is stale: ${problems.join("; ")}. Run: bun scripts/logo-atlas.ts`);
      process.exit(1);
    }
    console.log("logo atlas is fresh");
  } else {
    await generate();
  }
}
