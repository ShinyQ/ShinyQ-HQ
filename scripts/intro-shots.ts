#!/usr/bin/env bun
/**
 * Intro review captures: the boot card, then the whole intro (Boot rover to explore) on the virtual frame clock,
 * on desktop (full tier, 1440x900) and phone (lite tier, 390x844 touch), from a dev server or the served export.
 *
 *   bun scripts/intro-shots.ts --base http://localhost:3000 --out screenshots/intro
 *   DEVICES=desktop STRIP=10 bun scripts/intro-shots.ts --reduced
 *
 * Writes <device>/NNNN.png (one frame every `--stride` rendered frames, default 6), <device>-strip.png (a contact
 * strip of STRIP evenly spaced frames, default 10) and <device>.mp4 (10 fps, needs ffmpeg), plus timeline.json (per
 * capture: frame, phase, camera position, scene calls). `--reduced` emulates reduced motion and stores the
 * Motion choice "reduced". macOS renders on the real GPU (ANGLE Metal), other systems on SwiftShader (slow, same frames).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { driveUntil, installVirtualClock, stepFrames, waitForQuiet } from "../e2e/vclock";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = flag("--base", "http://localhost:3000");
const OUT = flag("--out", "screenshots/intro");
const STRIDE = Number(flag("--stride", "6"));
const STRIP = Number(process.env.STRIP ?? "10");
const REDUCED = args.includes("--reduced");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ALL_DEVICES = [
  { id: "desktop", viewport: { width: 1440, height: 900 }, touch: false, tier: "full", ua: UA },
  { id: "phone", viewport: { width: 390, height: 844 }, touch: true, tier: "lite", ua: PHONE_UA },
] as const;
const DEVICES = process.env.DEVICES ? ALL_DEVICES.filter((d) => process.env.DEVICES!.split(",").includes(d.id)) : ALL_DEVICES;
/** Frames recorded after the intro hands over, so the strip ends on the settled follow camera. */
const TAIL = 60;
const MAX_FRAMES = 900;

type HQ = { __hq: { store: { getState(): { phase: string } }; rover: { drawCalls: number; cameraPosition: number[] } } };

const GPU_ARGS = process.platform === "darwin" ? ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

async function probe(page: Page) {
  return page.evaluate(() => {
    const hq = (window as unknown as HQ).__hq;
    return { phase: hq.store.getState().phase, camera: hq.rover.cameraPosition.map((v) => Math.round(v * 100) / 100), calls: hq.rover.drawCalls };
  });
}

mkdirSync(OUT, { recursive: true });
const timeline: Record<string, unknown[]> = {};
const browser = await chromium.launch({ args: GPU_ARGS });
try {
  for (const d of DEVICES) {
    const dir = join(OUT, d.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const context = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: 1, hasTouch: d.touch, isMobile: d.touch, userAgent: d.ua, reducedMotion: REDUCED ? "reduce" : "no-preference" });
    await context.route("**/api/stats", (route) => route.fulfill({ status: 204 }));
    const page = await context.newPage();
    await installVirtualClock(page, { autorun: false });
    await page.addInitScript((reduced) => {
      localStorage.setItem("hq:terminal-seen", "1");
      localStorage.setItem("hq:onboarded", "done");
      localStorage.setItem("hq:hints", "off");
      localStorage.setItem("hq:floor-intro", JSON.stringify(["L2", "L3", "L4", "RF"]));
      const raw = localStorage.getItem("hq:v1");
      const saved = raw ? JSON.parse(raw) : { state: {}, version: 3 };
      // A new visitor's intro plays in full under the OS setting alone; the stored Motion choice turns it off.
      const motion = reduced ? { motion: "reduced" } : {};
      localStorage.setItem("hq:v1", JSON.stringify({ ...saved, state: { ...saved.state, ...motion, floorsSeen: ["L1", "L2", "L3", "L4", "RF"], b1Unlocked: true } }));
      sessionStorage.setItem("hq:ask-teaser", "1");
    }, REDUCED);
    await page.goto(`${BASE}/en?tier=${d.tier}`);
    await page.getByTestId("hq").waitFor({ timeout: 120_000 });
    await driveUntil(page, () => document.querySelector('[data-testid="boot"] button:not([aria-disabled="true"])') !== null, { maxFrames: 1500, batch: 10 });
    await waitForQuiet(page);
    await stepFrames(page, 10);
    let n = 0;
    const shot = async () => page.screenshot({ path: join(dir, `${String(n++).padStart(4, "0")}.png`), caret: "hide" });
    const rows: unknown[] = [];
    await shot();
    rows.push({ frame: 0, ...(await probe(page)) });
    await page.getByTestId("boot").getByRole("button", { name: "Boot rover" }).click();
    let frame = 0;
    let tail = -1;
    while (frame < MAX_FRAMES && tail < TAIL) {
      await stepFrames(page, STRIDE);
      frame += STRIDE;
      await shot();
      const p = await probe(page);
      rows.push({ frame, ...p });
      if (tail >= 0) tail += STRIDE;
      else if (p.phase === "explore") tail = 0;
    }
    timeline[d.id] = rows;
    // Contact strip: STRIP frames evenly spaced over the recording, in one row (desktop scaled to 480 px wide, phone to 195).
    const width = d.id === "desktop" ? 480 : 195;
    const pick = Array.from({ length: STRIP }, (_, i) => Math.round((i * (n - 1)) / Math.max(1, STRIP - 1)));
    const inputs = pick.flatMap((i) => ["-i", join(dir, `${String(i).padStart(4, "0")}.png`)]);
    const scaled = pick.map((_, i) => `[${i}:v]scale=${width}:-1[s${i}]`).join(";");
    const stack = `${pick.map((_, i) => `[s${i}]`).join("")}hstack=inputs=${pick.length}`;
    spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", `${scaled};${stack}`, join(OUT, `${d.id}-strip.png`)], { stdio: "inherit" });
    spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(60 / STRIDE), "-i", join(dir, "%04d.png"), "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-pix_fmt", "yuv420p", join(OUT, `${d.id}.mp4`)], { stdio: "inherit" });
    console.log(`${d.id}: ${n} frames, strip frames ${pick.join(",")}`);
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(join(OUT, "timeline.json"), JSON.stringify(timeline, null, 1));
}
