import { mkdirSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { asReturningVisitor, waitForPhase } from "./hq";
import { driveUntil, frameCount, installVirtualClock, stepFrames, waitForQuiet } from "./vclock";

/**
 * Screenshot-diff gate for look-preserving GPU work (round 5, P2). Run it only through
 * `bun scripts/visual-gate.ts`, which captures baselines from a base build and then compares.
 */
test.skip(!process.env.VISUAL_GATE, "Run through `bun scripts/visual-gate.ts`");
// Not serial: one failing pose must not skip the rest (the gate runs with one worker, so still in order).
test.describe.configure({ timeout: 300_000 });
// Base and head are captured on the same machine, so the real GPU keeps the comparison fair and is
// about 100x faster than SwiftShader at 2880x1800 (full tier: about 1.2 s per frame there). macOS runs
// on ANGLE Metal; VISUAL_GATE_GPU=swiftshader (or another OS) keeps the suite's SwiftShader.
if (process.platform === "darwin" && process.env.VISUAL_GATE_GPU !== "swiftshader") {
  test.use({ launchOptions: { args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] } });
}

type Device = { name: string; width: number; height: number; dpr: number; tier: "full" | "lite"; touch: boolean; info?: boolean };
type Pose = { name: string; kind: "settled" | "intro" | "ride"; path: string; to?: string };
type Limits = { threshold: number; maxDiffPixelRatio: number };

const DEVICES: readonly Device[] = [
  { name: "full-1440x900@2", width: 1440, height: 900, dpr: 2, tier: "full", touch: false },
  { name: "full-2560x1440@1", width: 2560, height: 1440, dpr: 1, tier: "full", touch: false },
  { name: "lite-390x844@3", width: 390, height: 844, dpr: 3, tier: "lite", touch: true },
  // Windows at 150%: not gated (no baseline rule covers it), captured for an owner eyeball check.
  { name: "full-1920x1080@1.5", width: 1920, height: 1080, dpr: 1.5, tier: "full", touch: false, info: true },
];

const POSES: readonly Pose[] = [
  { name: "l1-spawn", kind: "settled", path: "/en" },
  { name: "l2-journey", kind: "settled", path: "/en/journey" },
  { name: "l3-labs", kind: "settled", path: "/en/labs" },
  { name: "l4-library", kind: "settled", path: "/en/library" },
  { name: "rf-contact", kind: "settled", path: "/en/contact" },
  { name: "intro-still", kind: "intro", path: "/en" },
  { name: "ride-up-l1-l2", kind: "ride", path: "/en", to: "L2" },
  { name: "ride-down-rf-l1", kind: "ride", path: "/en/contact", to: "L1" },
];

const STRICT: Limits = { threshold: 0.1, maxDiffPixelRatio: 0.001 };
const BLENDED: Limits = { threshold: 0.1, maxDiffPixelRatio: 0.002 };
const RETINA_AA: Limits = { threshold: 0.2, maxDiffPixelRatio: 0.004 };
const RETINA_RELEASE: Limits = { threshold: 0.2, maxDiffPixelRatio: 0.005 };
const retina = (d: Device) => d.tier === "full" && d.dpr >= 1.5;
const textHeavy = (p: Pose) => /^(l1|l2|intro|ride)/.test(p.name);

/** Threshold profiles: each task names the one that matches what it may change. */
const PROFILES: Record<string, (d: Device, p: Pose) => Limits> = {
  strict: () => STRICT,
  msaa: (d) => (retina(d) ? RETINA_AA : STRICT),
  batching: (_d, p) => (textHeavy(p) ? BLENDED : STRICT),
  release: (d, p) => (retina(d) ? RETINA_RELEASE : textHeavy(p) ? BLENDED : STRICT),
};
const profile = PROFILES[process.env.VISUAL_GATE_PROFILE ?? "strict"] ?? PROFILES.strict;
/** Every pose is drawn at a fixed frame count from page load (the scene animates even under reduced motion). */
const SETTLE_FRAME = 600;
const INTRO_CLICK_FRAME = 600;
const RIDE_START_FRAME = 1200;

type HQ = { __hq: { store: { getState(): { phase: string; floor: string; ride: { stage: string } | null; goToFloor(f: string): void } }; rover: { drawCalls: number } } };

async function open(browser: Browser, device: Device, pose: Pose) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.dpr,
    hasTouch: device.touch,
    isMobile: device.touch,
    reducedMotion: pose.kind === "ride" ? "no-preference" : "reduce",
  });
  const page = await context.newPage();
  await page.route("**/api/ask", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-11", maxLength: 300 }) }),
  );
  await installVirtualClock(page, { autorun: false });
  if (pose.kind === "intro") {
    await page.addInitScript(() => {
      localStorage.setItem("hq:terminal-seen", "1");
      localStorage.setItem("hq:onboarded", "done");
      localStorage.setItem("hq:hints", "off");
      sessionStorage.setItem("hq:ask-teaser", "1");
    });
  } else {
    await asReturningVisitor(page);
  }
  await page.goto(`${pose.path}?tier=${device.tier}`);
  return { context, page };
}

const live = () => {
  const w = window as unknown as Partial<HQ>;
  const s = w.__hq?.store.getState();
  return Boolean(s && s.phase === "explore" && (w.__hq?.rover.drawCalls ?? 0) > 0 && !document.documentElement.hasAttribute("data-hq-boot"));
};

/** Steps to exactly `frame` frames since load; fails if the page needed more frames to get there. */
async function stepTo(page: Page, frame: number) {
  const frames = await frameCount(page);
  if (frames > frame) throw new Error(`reached the pose at frame ${frames}, after the fixed frame ${frame}`);
  await stepFrames(page, frame - frames);
}

async function settle(page: Page, pose: Pose) {
  await page.getByTestId("hq").waitFor({ timeout: 120_000 });
  if (pose.kind === "settled") {
    await driveUntil(page, live, { maxFrames: SETTLE_FRAME, batch: 10 });
    await waitForQuiet(page);
    await stepTo(page, SETTLE_FRAME);
  } else if (pose.kind === "intro") {
    const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
    await driveUntil(page, () => document.querySelector('[data-testid="boot"] button:not([aria-disabled="true"])') !== null, { maxFrames: INTRO_CLICK_FRAME, batch: 10 });
    await waitForQuiet(page);
    await stepTo(page, INTRO_CLICK_FRAME);
    await start.click();
    await waitForPhase(page, "intro");
    await waitForQuiet(page);
    await stepFrames(page, 30);
  } else {
    await driveUntil(page, live, { maxFrames: RIDE_START_FRAME, batch: 30 });
    await waitForQuiet(page);
    await stepTo(page, RIDE_START_FRAME);
    await page.evaluate((to) => (window as unknown as HQ).__hq.store.getState().goToFloor(to), pose.to!);
    // The target floor mounts now: give fonts, chunks and troika real time before the dolly.
    await page.waitForTimeout(1000);
    await waitForQuiet(page);
    await driveUntil(page, () => (window as unknown as HQ).__hq.store.getState().ride?.stage === "moving", { maxFrames: 1200, batch: 1 });
    await stepFrames(page, 24);
  }
  // Last frames one task at a time: troika repacks a text batch in a promise after its members typeset
  // (a worker), and a real browser runs those between frames, not inside one stepped evaluate.
  for (let i = 0; i < 3; i++) {
    await waitForQuiet(page, 150);
    await stepFrames(page, 1);
  }
}

for (const device of DEVICES) {
  for (const pose of POSES) {
    test(`${device.name} ${pose.name}`, async ({ browser }) => {
      const { context, page } = await open(browser, device, pose);
      try {
        await settle(page, pose);
        const name = `${device.name}-${pose.name}.png`;
        if (device.info) {
          const dir = `test-results/visual-gate-info/${process.env.VISUAL_GATE_LABEL ?? "run"}`;
          mkdirSync(dir, { recursive: true });
          await page.screenshot({ path: `${dir}/${name}`, animations: "disabled", caret: "hide", scale: "device" });
          return;
        }
        await expect(page).toHaveScreenshot(name, { ...profile(device, pose), animations: "disabled", caret: "hide", scale: "device", timeout: 60_000 });
      } finally {
        await context.close();
      }
    });
  }
}
