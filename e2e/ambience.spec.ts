import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { enterHQ, waitForFloor } from "./hq";

/**
 * Floor ambience (Round 9 O): the "Floor ambience" switch sits in the settings sound group, persists
 * `hq:ambience` and drives the engine; the engine follows the floor the rover is on. The sound itself is
 * never asserted (the unit tests cover the voice); `window.__hq.audio()` is the read-only probe.
 */
test.describe.configure({ timeout: 120_000 });

type AudioProbe = { floor: string | null; ambience: boolean; muted: boolean };
const probe = (page: Page) => page.evaluate(() => (window as unknown as { __hq: { audio: () => AudioProbe } }).__hq.audio());
const stored = (page: Page) => page.evaluate(() => localStorage.getItem("hq:ambience"));

async function openSettings(page: Page) {
  await page.keyboard.press(",");
  const sheet = page.getByTestId("settings-sheet");
  await expect(sheet).toBeVisible();
  return sheet;
}

test("the Floor ambience switch sits in the sound group, persists and drives the engine", async ({ page }) => {
  await enterHQ(page);
  await expect.poll(() => probe(page)).toMatchObject({ floor: "L1", ambience: true });
  expect(await stored(page)).toBeNull();

  const sheet = await openSettings(page);
  const row = sheet.getByTestId("setting-ambience");
  await expect(row).toBeVisible();
  const group = sheet.getByRole("region", { name: en.hud.settings.groups.sound });
  await expect(group.getByTestId("setting-ambience")).toHaveCount(1);
  await expect(row).toContainText(en.hud.settings.ambience.hint);
  const toggle = row.getByRole("switch", { name: en.hud.settings.ambience.label });
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(await stored(page)).toBe("off");
  await expect.poll(() => probe(page)).toMatchObject({ ambience: false });

  // Independent of the music toggle.
  await expect(sheet.getByTestId("setting-music").getByRole("switch", { name: en.hud.settings.music.label })).toHaveAttribute("aria-checked", "true");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(await stored(page)).toBe("on");
  await expect.poll(() => probe(page)).toMatchObject({ ambience: true });
});

test("a stored off is read at start", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("hq:ambience", "off"));
  await enterHQ(page);
  await expect.poll(() => probe(page)).toMatchObject({ ambience: false });
  const sheet = await openSettings(page);
  await expect(sheet.getByTestId("setting-ambience").getByRole("switch")).toHaveAttribute("aria-checked", "false");
});

test("the engine follows the floor the rover is on, also with ambience off", async ({ page }) => {
  await enterHQ(page);
  await expect.poll(() => probe(page)).toMatchObject({ floor: "L1" });
  await page.keyboard.press("PageUp");
  await waitForFloor(page, "L2");
  await expect.poll(() => probe(page)).toMatchObject({ floor: "L2", ambience: true });
  const sheet = await openSettings(page);
  await sheet.getByTestId("setting-ambience").getByRole("switch").click();
  await expect.poll(() => probe(page)).toMatchObject({ floor: "L2", ambience: false });
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await page.keyboard.press("PageUp");
  await waitForFloor(page, "L3");
  await expect.poll(() => probe(page)).toMatchObject({ floor: "L3", ambience: false });
});

test("a floor deep link starts the engine on that floor", async ({ page }) => {
  await enterHQ(page, { path: "/en/labs" });
  await waitForFloor(page, "L3");
  await expect.poll(() => probe(page)).toMatchObject({ floor: "L3" });
});

test("Indonesian pages label the row Suasana lantai", async ({ page }) => {
  await enterHQ(page, { path: "/id" });
  const sheet = await openSettings(page);
  await expect(sheet.getByTestId("setting-ambience").getByRole("switch", { name: id.hud.settings.ambience.label })).toBeVisible();
  expect(id.hud.settings.ambience.label).toBe("Suasana lantai");
  await expect(sheet.getByTestId("setting-ambience")).toContainText(id.hud.settings.ambience.hint);
});
