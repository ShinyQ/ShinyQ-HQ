import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { chooseMotion, asReturningVisitor, skipFloorLines, waitForCameraSettle, waitForFrames, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";
import en from "../messages/en.json";

/**
 * Opt-in look gate for the round 5 camera work (P7). `CAMERA_SHOTS=baseline` captures third-person
 * poses that exist before and after the change; `CAMERA_SHOTS=compare` captures them again and fails
 * when more than MAX_SHARE of the pixels differ by more than DELTA on any channel. Compare mode also
 * saves first-person captures for review. HUD hidden, reduced motion on (no bob, pulses or motes),
 * returning visitor, a fresh context per pose. Metrics (draw calls, triangles) go next to the images.
 */
const MODE = process.env.CAMERA_SHOTS as "baseline" | "compare" | undefined;
test.skip(!MODE, "Set CAMERA_SHOTS=baseline or CAMERA_SHOTS=compare");
// Full tier at 2560x1440 renders on the CPU (SwiftShader): a pose can take minutes on a busy machine.
test.describe.configure({ timeout: 1_800_000 });
const WAIT = 240_000;

const DIR = "screenshots/camera";
const MAX_SHARE = 0.005;
const DELTA = 24;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, tier: "full", touch: false },
  { name: "wide", width: 2560, height: 1440, tier: "full", touch: false },
  { name: "phone", width: 390, height: 844, tier: "lite", touch: true },
] as const;
type Viewport = (typeof VIEWPORTS)[number];

const FLOORS = [
  { floor: "L1", path: "/en" },
  { floor: "L2", path: "/en/journey" },
  { floor: "L3", path: "/en/labs" },
  { floor: "L4", path: "/en/library" },
  { floor: "RF", path: "/en/contact" },
] as const;

type Pose = "default" | "rotated" | "zoomed";
/** L2's rotate step changes on purpose (35 degree clamp before, 360 degrees after), so L2 keeps only its default and zoomed poses. */
const posesFor = (floor: string): Pose[] => (floor === "L2" ? ["default", "zoomed"] : ["default", "rotated", "zoomed"]);

type Metrics = { drawCalls: number; triangles: number; diffShare?: number };

async function open(browser: Browser, v: Viewport, path: string, quiet = false) {
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    hasTouch: v.touch,
    isMobile: v.name === "phone",
    reducedMotion: "reduce",
  });
  await chooseMotion(context, "system");
  const page = await context.newPage();
  await asReturningVisitor(page);
  // First-person captures: no first-visit floor line (Rover's box would sit under the fingers of a pinch).
  if (quiet) await skipFloorLines(page);
  await page.goto(`${path}?tier=${v.tier}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore", WAIT);
  await waitForSceneLive(page, WAIT);
  return { context, page };
}

async function apply(page: Page, pose: Pose, v: Viewport) {
  if (pose === "rotated") {
    await page.getByRole("button", { name: en.hud.view.rotateRight }).click();
  } else if (pose === "zoomed") {
    // Ctrl+wheel is the trackpad pinch path, which zooms both before and after P7 (factor exp(-0.224) = 0.8).
    await page.mouse.move(v.width / 2 + 120, v.height / 2);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -112);
    await page.keyboard.up("Control");
  }
}

async function capture(page: Page): Promise<{ png: Buffer; metrics: Metrics }> {
  await waitForCameraSettle(page, { timeout: WAIT });
  await page.evaluate(() => document.fonts.ready);
  await waitForFrames(page, 20);
  await page.addStyleTag({ content: "[data-testid='hud']{visibility:hidden!important}" });
  await waitForFrames(page, 5);
  const metrics = await page.evaluate(() => {
    const r = (window as unknown as { __hq: { rover: { drawCalls: number; triangles: number } } }).__hq.rover;
    return { drawCalls: r.drawCalls, triangles: r.triangles };
  });
  return { png: await page.screenshot(), metrics };
}

/** Two-finger pinch out through CDP, centered, clear of the HUD's side columns. */
async function pinchOpen(page: Page, v: Viewport) {
  const cdp = await page.context().newCDPSession(page);
  const y = Math.round(v.height * 0.55);
  const at = (d: number) => [
    { x: v.width / 2 - d / 2, y, id: 1 },
    { x: v.width / 2 + d / 2, y, id: 2 },
  ];
  let timestamp = Date.now() / 1000;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(60), timestamp });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(60 + 16 * i), timestamp: (timestamp += 0.04) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: (timestamp += 0.04) });
  await cdp.detach();
}

/** Share of pixels that differ by more than DELTA on any channel, decoded in a blank page (no site CSP). */
async function diffShare(browser: Browser, a: Buffer, b: Buffer): Promise<number> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    return await page.evaluate(
      async ({ a, b, delta }) => {
        const decode = async (b64: string) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(bitmap, 0, 0);
          return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        };
        const [x, y] = await Promise.all([decode(a), decode(b)]);
        if (x.width !== y.width || x.height !== y.height) return 1;
        let off = 0;
        for (let i = 0; i < x.data.length; i += 4) {
          if (Math.abs(x.data[i] - y.data[i]) > delta || Math.abs(x.data[i + 1] - y.data[i + 1]) > delta || Math.abs(x.data[i + 2] - y.data[i + 2]) > delta) off++;
        }
        return off / (x.width * x.height);
      },
      { a: a.toString("base64"), b: b.toString("base64"), delta: DELTA },
    );
  } finally {
    await context.close();
  }
}

for (const v of VIEWPORTS) {
  for (const { floor, path } of FLOORS) {
    test(`third-person poses on ${floor} at ${v.width}x${v.height} (${v.tier})`, async ({ browser }) => {
      const out = `${DIR}/${MODE}`;
      mkdirSync(out, { recursive: true });
      const all: Record<string, Metrics> = {};
      for (const pose of posesFor(floor)) {
        const { context, page } = await open(browser, v, path);
        await apply(page, pose, v);
        const { png, metrics } = await capture(page);
        await context.close();
        const name = `${floor}-${pose}-${v.width}x${v.height}`;
        writeFileSync(`${out}/${name}.png`, png);
        all[name] = metrics;
        if (MODE === "compare") {
          const share = await diffShare(browser, readFileSync(`${DIR}/baseline/${name}.png`), png);
          all[name] = { ...metrics, diffShare: share };
          expect(share, `${name}: share of changed pixels`).toBeLessThanOrEqual(MAX_SHARE);
        }
      }
      writeFileSync(`${out}/metrics-${floor}-${v.width}x${v.height}.json`, JSON.stringify(all, null, 2));
    });
  }
}

for (const v of VIEWPORTS) {
  test(`first-person captures for review at ${v.width}x${v.height} (${v.tier})`, async ({ browser }) => {
    test.skip(MODE !== "compare", "first person exists only after P7");
    const out = `${DIR}/compare`;
    mkdirSync(out, { recursive: true });
    const all: Record<string, Metrics> = {};
    for (const { floor, path } of FLOORS) {
      const { context, page } = await open(browser, v, path, true);
      if (v.touch) {
        // Phones pinch (the wheel is a mouse gesture): fingers apart all the way into first person.
        await pinchOpen(page, v);
      } else {
        await page.mouse.move(v.width / 2, v.height / 2);
        // From the default zoom the third notch enters first person; later notches are ignored there.
        for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -120);
      }
      await page.waitForFunction(() => (window as unknown as { __hq: { rover: { cameraBlend: number } } }).__hq.rover.cameraBlend === 1, null, { timeout: WAIT });
      const { png, metrics } = await capture(page);
      await context.close();
      const name = `fp-${floor}-${v.width}x${v.height}`;
      writeFileSync(`${out}/${name}.png`, png);
      all[name] = metrics;
    }
    writeFileSync(`${out}/metrics-fp-${v.width}x${v.height}.json`, JSON.stringify(all, null, 2));
  });
}
