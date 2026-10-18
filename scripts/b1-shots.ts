#!/usr/bin/env bun
/**
 * B1 Engine Room captures for the owner's review (spec section 7): the arrival, the aisle and each station's
 * drawer at 1440x900 (full tier) and 390x844 (lite), on a served export, unlocked with the dev and test flag.
 * PR 3 adds the locked row, the unlock moment and the unlocked row (`--only unlock`; `--only floor` skips them).
 * SwiftShader WebGL.
 *
 *   bun scripts/serve-static.ts --port 4300 --dir out &
 *   bun scripts/b1-shots.ts --base http://127.0.0.1:4300 --out screenshots/b1
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { B1_QUERY } from "../e2e/b1";
import { ENGINE_STATIONS } from "../src/experience/floors/engine/layout";

const VIEWPORTS = [
  { width: 1440, height: 900, tier: "full" },
  { width: 390, height: 844, tier: "lite" },
] as const;

type HQ = {
  store: { getState: () => { floor: string; ride: unknown; phase: string; goToFloor: (f: string) => void; openRoom: (r: string) => void; closeRoom: () => void } };
  rover: { x: number; z: number; speed: number; driving: boolean; drawCalls: number; autopilot: { point: { x: number; z: number }; state: string } | null };
  camera: () => [number, number, number];
  layouts: Record<string, { arrival?: { x: number; z: number }; doors?: { room: string; at: { x: number; z: number } }[] }>;
};

let base = "http://127.0.0.1:4300";
let out = "screenshots/b1";
type Only = "floor" | "unlock" | "all";
let only: Only = "all";
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--base") base = argv[++i];
  else if (argv[i] === "--out") out = argv[++i];
  else if (argv[i] === "--only") only = argv[++i] as Only;
}
mkdirSync(out, { recursive: true });

/** Rendered animation frames (state that changes per frame, not per millisecond; SwiftShader can stall for seconds). */
const frames = (page: Page, count: number) =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const tick = () => (++seen >= n ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    count,
  );

/** Waits for no ride, a parked rover and a follow camera that holds still over 12 frames. */
async function settle(page: Page) {
  await page.waitForFunction(
    () => {
      const h = (window as unknown as { __hq: HQ }).__hq;
      const s = h.store.getState();
      return s.ride === null && s.phase !== "elevator" && !h.rover.driving && h.rover.speed < 0.2;
    },
    null,
    { timeout: 120_000, polling: 250 },
  );
  for (let i = 0; i < 40; i++) {
    const a = await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.camera());
    await frames(page, 12);
    const b = await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.camera());
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.03) return;
  }
}

async function driveTo(page: Page, point: { x: number; z: number }) {
  await page.evaluate((p) => ((window as unknown as { __hq: HQ }).__hq.rover.autopilot = { point: p, state: "pending" }), point);
  await page.waitForFunction(
    () => {
      const r = (window as unknown as { __hq: HQ }).__hq.rover;
      return r.autopilot?.state !== "pending" && r.autopilot?.state !== "driving" && r.speed < 0.5;
    },
    null,
    { timeout: 120_000, polling: 250 },
  );
  await settle(page);
}

const shot = (page: Page, name: string, vp: { width: number; height: number }) => page.screenshot({ path: join(out, `${name}-${vp.width}x${vp.height}.png`) });

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.width < 1000, isMobile: vp.width < 600 });
    await context.addInitScript(() => {
      localStorage.setItem("hq:terminal-seen", "1");
      localStorage.setItem("hq:onboarded", "done");
      localStorage.setItem("hq:hints", "off");
      localStorage.setItem("hq:floor-intro", JSON.stringify(["B1", "L1", "L2", "L3", "L4", "RF"]));
      sessionStorage.setItem("hq:intro", "seen");
    });
    if (only !== "unlock") {
      const page = await context.newPage();
      await page.goto(`${base}/en?tier=${vp.tier}&${B1_QUERY}`);
      await page.waitForFunction(() => ((window as unknown as { __hq?: HQ }).__hq?.rover.drawCalls ?? 0) > 0 && !document.documentElement.hasAttribute("data-hq-boot"), null, { timeout: 180_000, polling: 250 });
      await settle(page);
      await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.store.getState().goToFloor("B1"));
      await page.waitForFunction(() => (window as unknown as { __hq: HQ }).__hq.store.getState().floor === "B1", null, { timeout: 120_000, polling: 250 });
      await settle(page);
      await shot(page, "arrival", vp);
      await driveTo(page, { x: 12, z: 0 });
      await shot(page, "aisle", vp);
      const doors = await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.layouts.B1.doors ?? []);
      for (const id of ENGINE_STATIONS) {
        const door = doors.find((d) => d.room === `B1:${id}`);
        if (!door) throw new Error(`No B1 door for ${id}`);
        await driveTo(page, door.at);
        await page.evaluate((r) => (window as unknown as { __hq: HQ }).__hq.store.getState().openRoom(r), `B1:${id}`);
        await page.locator(`[data-testid="room-drawer"] [data-engine-station="${id}"]`).waitFor({ timeout: 60_000 });
        await page.evaluate(() => document.fonts.ready);
        await frames(page, 20);
        await shot(page, `station-${id}`, vp);
        await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.store.getState().closeRoom());
      }
      await page.close();
    }
    if (only !== "floor") {
      // Each page seeds its own persisted store (`hq:v1`, version 3) before load: the floors reached so far, locked.
      const seed = (floors: string[]) =>
        `localStorage.setItem("hq:v1", JSON.stringify({ state: { visited: [], firstVisit: false, locale: "en", motion: "full", floorsSeen: ${JSON.stringify(floors)}, b1Unlocked: false }, version: 3 }));`;
      const ready = (page: Page) =>
        page.waitForFunction(() => ((window as unknown as { __hq?: HQ }).__hq?.rover.drawCalls ?? 0) > 0 && !document.documentElement.hasAttribute("data-hq-boot"), null, { timeout: 180_000, polling: 250 });
      // The floor rows: the desktop rail is always on screen; phones open the Corners floor sheet from the floor chip.
      const showRows = async (page: Page) => {
        if (vp.width < 1000) await page.getByTestId("floor-chip").click();
        await page.locator('[data-floor="B1"]').first().waitFor({ timeout: 60_000 });
        await page.evaluate(() => document.fonts.ready);
        await frames(page, 20);
      };
      const lockedPage = await context.newPage();
      await lockedPage.addInitScript(seed(["L1", "L2", "L3"]));
      await lockedPage.goto(`${base}/en?tier=${vp.tier}`);
      await ready(lockedPage);
      await settle(lockedPage);
      await showRows(lockedPage);
      await shot(lockedPage, "locked-row", vp);
      await lockedPage.close();

      const momentPage = await context.newPage();
      await momentPage.addInitScript(seed(["L1", "L2", "L3", "L4"]));
      await momentPage.goto(`${base}/en?tier=${vp.tier}`);
      await ready(momentPage);
      await settle(momentPage);
      await momentPage.evaluate(() => (window as unknown as { __hq: HQ }).__hq.store.getState().goToFloor("RF"));
      const offer = momentPage.locator('[data-testid="dialog-box"][data-line="b1-unlock"]');
      await offer.waitFor({ timeout: 180_000 });
      // The line types out at 28 ms a character: wait until its choices show.
      await offer.getByRole("button", { name: "Take me there" }).waitFor({ timeout: 60_000 });
      await settle(momentPage);
      await frames(momentPage, 20);
      await shot(momentPage, "unlock-moment", vp);
      await offer.getByRole("button", { name: "Later" }).click();
      await offer.waitFor({ state: "detached", timeout: 60_000 });
      await showRows(momentPage);
      await shot(momentPage, "unlocked-row", vp);
      await momentPage.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
