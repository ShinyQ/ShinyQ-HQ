#!/usr/bin/env bun
/**
 * README media: the animated hero (boot card, intro, a boosted drive on L1, an elevator ride to
 * L3 Project Roads) and one settled still per floor, captured from the static export.
 *
 *   bun run build && bun scripts/readme-hero.ts     # needs ffmpeg and gifsicle (brew install ffmpeg gifsicle)
 *   bun scripts/readme-hero.ts --frames-only        # capture only (PNG frames in test-results/readme-hero)
 *   bun scripts/readme-hero.ts --encode-only        # re-encode the last captured frames
 *
 * Writes docs/readme/hero.gif (the README hero, kept under 6 MB), hero.jpg (still fallback) and
 * floor-{L1,L2,L3,L4,RF}.jpg (the floor guide), plus test-results/readme-hero/hero.mp4 (1280 px,
 * 20 fps) for PR previews; the MP4 is not committed.
 *
 * Frames come from the visual gate's virtual frame clock (`e2e/vclock.ts`): every capture is exactly
 * `stride` rendered frames after the previous one, so the motion is smooth whatever the machine. macOS
 * renders on the real GPU (ANGLE Metal), other systems on SwiftShader (slow, same frames). Motion is
 * Full (the default), the tour, hint bubbles and floor lines are off, and the Ask status is mocked so
 * the Ask AI pill shows as in production.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { driveUntil, installVirtualClock, stepFrames, waitForQuiet } from "../e2e/vclock";

const args = process.argv.slice(2);
const framesOnly = args.includes("--frames-only");
const encodeOnly = args.includes("--encode-only");
const PORT = 4391;
const BASE = `http://127.0.0.1:${PORT}`;
const FRAMES = "test-results/readme-hero";
const OUT = "docs/readme";
/** At or above 1024 px the HUD stays on one row; DPR 1.6 gives 1920x1080 frames to downscale. */
const VIEWPORT = { width: 1200, height: 675 };
const DPR = 1.6;
/** Captured at 20 fps (the preview MP4); the GIF keeps 10 fps, undithered, to stay under 6 MB. */
const FPS = 20;
const GIF_FPS = 10;
const STRIDE = 60 / FPS;
/** Optional camera keys held for a number of frames after settling (Q/E rotate, R/F tilt, -/+ zoom). */
type Hold = { key: string; frames: number };
const FLOORS: readonly { id: string; path: string; hold?: Hold[] }[] = [
  { id: "L1", path: "/en" },
  { id: "L2", path: "/en/journey" },
  { id: "L3", path: "/en/labs" },
  { id: "L4", path: "/en/library", hold: JSON.parse(process.env.HERO_L4_HOLD ?? '[{"key":"-","frames":60},{"key":"q","frames":30}]') },
  { id: "RF", path: "/en/contact" },
];
const ONLY = process.env.HERO_FLOORS?.split(",");
/** Same fixed frame count as the visual gate's settled poses. */
const SETTLE_FRAME = 600;

type HQ = {
  __hq: {
    store: { getState(): { phase: string; floor: string; ride: { stage: string } | null; goToFloor(f: string): void } };
    rover: { drawCalls: number; speed: number; autopilot: { state: string } | null };
  };
};

const live = () => {
  const w = window as unknown as Partial<HQ>;
  const s = w.__hq?.store.getState();
  return Boolean(s && s.phase === "explore" && (w.__hq?.rover.drawCalls ?? 0) > 0 && !document.documentElement.hasAttribute("data-hq-boot"));
};

let shot = 0;
const framePath = (n: number) => join(FRAMES, `${String(n).padStart(4, "0")}.png`);

async function capture(page: Page) {
  await page.screenshot({ path: framePath(shot++), scale: "device", caret: "hide" });
}

/** Records `frames` rendered frames, one capture every `stride` frames (2 x STRIDE plays at 2x speed). */
async function record(page: Page, frames: number, stride = STRIDE) {
  for (let done = 0; done < frames; done += stride) {
    await stepFrames(page, stride);
    await capture(page);
  }
}

/** Records until `check` holds in the page, one capture every `stride` frames; fails after `max` frames. */
async function recordUntil(page: Page, check: () => boolean, max: number, stride = STRIDE) {
  for (let done = 0; done < max; done += stride) {
    await stepFrames(page, stride);
    await capture(page);
    if (await page.evaluate(check)) return;
  }
  throw new Error("state not reached while recording");
}

/** The production snapshot, so the Visitor Observatory shows real numbers (204 when unreachable). */
let statsBody: string | null = null;
async function loadStats() {
  try {
    const res = await fetch("https://kurniadi.pages.dev/api/stats");
    if (res.status === 200) statsBody = await res.text();
  } catch {}
}

async function newPage(browser: Browser, returning: boolean) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.route("**/api/ask", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-14", maxLength: 300 }) }),
  );
  await page.route("**/api/stats", (route) =>
    statsBody ? route.fulfill({ status: 200, contentType: "application/json", body: statsBody }) : route.fulfill({ status: 204 }),
  );
  await installVirtualClock(page, { autorun: false });
  await page.addInitScript((returning) => {
    localStorage.setItem("hq:terminal-seen", "1");
    localStorage.setItem("hq:onboarded", "done");
    localStorage.setItem("hq:hints", "off");
    localStorage.setItem("hq:floor-intro", JSON.stringify(["L2", "L3", "L4", "RF"]));
    // All five floors seen and B1 unlocked, so Rover's offer and chime never land in a capture.
    const raw = localStorage.getItem("hq:v1");
    const saved = raw ? JSON.parse(raw) : { state: {}, version: 3 };
    localStorage.setItem("hq:v1", JSON.stringify({ ...saved, state: { ...saved.state, floorsSeen: ["L1", "L2", "L3", "L4", "RF"], b1Unlocked: true } }));
    sessionStorage.setItem("hq:ask-teaser", "1");
    if (returning) sessionStorage.setItem("hq:intro", "seen");
  }, returning);
  return { context, page };
}

async function hero(browser: Browser) {
  const { context, page } = await newPage(browser, false);
  try {
    await page.goto(`${BASE}/en?tier=full`);
    await page.getByTestId("hq").waitFor({ timeout: 120_000 });

    // 1. Boot card: wait until the log has typed out, then hold it.
    await driveUntil(page, () => document.querySelector('[data-testid="boot"] button:not([aria-disabled="true"])') !== null, { maxFrames: 1200, batch: 10 });
    await waitForQuiet(page);
    await record(page, 24);

    // 2. Intro: Rover wakes up, then the reveal orbit lands on the spawn in front of the Rover menu kiosk (3x: the
    // orbit moves the whole frame, the costliest part of the GIF).
    await page.getByTestId("boot").getByRole("button", { name: "Boot rover" }).click();
    await recordUntil(page, () => (window as unknown as HQ).__hq.store.getState().phase === "explore", 600, STRIDE * 3);
    await record(page, 18);

    // 3. Boosted drive past the hologram (Shift + S: toward the camera from the spawn view), then a glide.
    await page.keyboard.down("Shift");
    await page.keyboard.down("s");
    await record(page, 66);
    await page.keyboard.up("s");
    await page.keyboard.up("Shift");
    await record(page, 15);

    // 4. Elevator to L3: the drive to the car at 3x, the ride at 1x, the roll-on at 2x, then a hold.
    await page.evaluate(() => (window as unknown as HQ).__hq.store.getState().goToFloor("L3"));
    await recordUntil(page, () => (window as unknown as HQ).__hq.store.getState().ride?.stage === "moving", 1800, STRIDE * 3);
    await recordUntil(page, () => (window as unknown as HQ).__hq.store.getState().floor === "L3", 1800);
    await recordUntil(
      page,
      () => {
        const w = window as unknown as HQ;
        const s = w.__hq.store.getState();
        const state = w.__hq.rover.autopilot?.state;
        return s.phase === "explore" && !s.ride && state !== "pending" && state !== "driving" && w.__hq.rover.speed < 0.3;
      },
      2400,
      STRIDE * 2,
    );
    await record(page, 36);
  } finally {
    await context.close();
  }
}

/** One settled, HUD-free still per floor at its route's start spot (as the visual gate poses). */
async function floorStills(browser: Browser) {
  for (const floor of FLOORS.filter((f) => !ONLY || ONLY.includes(f.id))) {
    const { context, page } = await newPage(browser, true);
    try {
      await page.goto(`${BASE}${floor.path}?tier=full`);
      await page.getByTestId("hq").waitFor({ timeout: 120_000 });
      await driveUntil(page, live, { maxFrames: SETTLE_FRAME, batch: 10 });
      await waitForQuiet(page);
      while ((await stepFrames(page, 30)) < SETTLE_FRAME) await waitForQuiet(page, 100);
      for (const hold of floor.hold ?? []) {
        await page.keyboard.down(hold.key);
        await stepFrames(page, hold.frames);
        await page.keyboard.up(hold.key);
      }
      if (floor.hold?.length) await stepFrames(page, 90);
      for (let i = 0; i < 3; i++) {
        await waitForQuiet(page, 150);
        await stepFrames(page, 1);
      }
      await page.addStyleTag({ content: '[data-testid="hud"], [data-testid="ask-dock"], [role="dialog"] { visibility: hidden !important; }' });
      await stepFrames(page, 1);
      const png = join(FRAMES, `floor-${floor.id}.png`);
      await page.screenshot({ path: png, scale: "device" });
      ff("-i", png, "-vf", "scale=960:-1:flags=lanczos", "-q:v", "4", join(OUT, `floor-${floor.id}.jpg`));
    } finally {
      await context.close();
    }
  }
}

function ff(...a: string[]) {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${a.join(" ")}`);
}

async function captureAll() {
  const server = spawn("bun", ["scripts/serve-static.ts", "--port", String(PORT), "--dir", "out"], { stdio: "ignore" });
  try {
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(`${BASE}/en`)).ok) break;
      } catch {}
      if (i > 100) throw new Error("static server did not start (run `bun run build` first)");
      await Bun.sleep(100);
    }
    if (!ONLY) rmSync(FRAMES, { recursive: true, force: true });
    mkdirSync(FRAMES, { recursive: true });
    mkdirSync(OUT, { recursive: true });
    const gpu = process.platform === "darwin" ? ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
    const browser = await chromium.launch({ args: gpu });
    try {
      await loadStats();
      if (!ONLY) await hero(browser);
      await floorStills(browser);
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }
}

if (encodeOnly || ONLY) shot = readdirSync(FRAMES).filter((f) => /^\d+\.png$/.test(f)).length;
if (!encodeOnly) await captureAll();
console.log(`hero: ${shot} frames`);

if (!framesOnly && !ONLY) {
  const input = ["-framerate", String(FPS), "-i", join(FRAMES, "%04d.png")];
  ff(...input, "-vf", "scale=1280:-2:flags=lanczos", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-preset", "slow", "-movflags", "+faststart", join(FRAMES, "hero.mp4"));
  const raw = join(FRAMES, "hero-raw.gif");
  ff(...input, "-vf", `fps=${GIF_FPS},scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`, "-loop", "0", raw);
  const lossy = spawnSync("gifsicle", ["-O3", "--lossy=100", raw, "-o", join(OUT, "hero.gif")], { stdio: "inherit" });
  if (lossy.status !== 0) throw new Error("gifsicle failed");
  ff("-i", framePath(Math.round(shot * Number(process.env.HERO_STILL ?? 0.3))), "-vf", "scale=1600:-1:flags=lanczos", "-q:v", "3", join(OUT, "hero.jpg"));
  for (const f of readdirSync(OUT).sort()) console.log(`${f}: ${(statSync(join(OUT, f)).size / 1024).toFixed(0)} KB`);
}
