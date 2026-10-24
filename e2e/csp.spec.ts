import { expect, test } from "@playwright/test";
import { asReturningVisitor, collectCspViolations, enterHQ, expectStrictPolicy, openPage, waitForFloor, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/**
 * The per-page script policy (scripts/csp-hashes.ts, Round 7 D): every page carries one
 * `data-hq-csp` meta tag whose script-src lists the sha256 of each inline script and no
 * 'unsafe-inline', and nothing the site runs (the 404 page, client navigation, the root redirect,
 * the CV in the shared PDF reader, the 3D boot, intro and an elevator ride) trips a violation. Every Classic route is
 * checked the same way in `e2e/static-routes.spec.ts` (`renders <route>`).
 */

test("the 404 page runs with no CSP violation", async ({ page }) => {
  const violations = await collectCspViolations(page);
  await page.goto("/en/no-such-page");
  await expectStrictPolicy(page);
  await page.waitForLoadState("load");
  expect(violations).toEqual([]);
});

test("client-side navigation injects no blocked script", async ({ page }) => {
  const violations = await collectCspViolations(page);
  await openPage(page, "/en?tier=static");
  await page.getByRole("banner").getByRole("link", { name: "Work", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/labs/);
  await page.getByRole("banner").getByRole("link", { name: "Journey", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/journey/);
  expect(violations).toEqual([]);
});

test("the / language redirect still runs under the strict policy", async ({ page }) => {
  const violations = await collectCspViolations(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await page.addInitScript(() => localStorage.setItem("hq:locale", "id"));
  await page.goto("/");
  await expect(page).toHaveURL(/\/id$/);
  expect(violations).toEqual([]);
});

test("the CV opens in the shared PDF reader (pdf.js and its worker) with no CSP violation", async ({ page }) => {
  const violations = await collectCspViolations(page);
  await openPage(page, "/en/contact?tier=static");
  await page.locator("main").getByTestId("cv-open").first().click();
  const dialog = page.getByRole("dialog", { name: "CV", exact: true });
  await expect(dialog.locator('[data-testid="cv-page"][data-page="1"]')).toHaveAttribute("data-rendered", "true", { timeout: 30_000 });
  expect(violations).toEqual([]);
});

test("the 3D boot, intro and an elevator ride run with no CSP violation", async ({ page }) => {
  test.slow();
  const violations = await collectCspViolations(page);
  // A fresh session (the boot and the intro play), but the first-session tour and hint bubbles stay
  // out of the way of the elevator panel.
  await page.addInitScript(() => {
    localStorage.setItem("hq:terminal-seen", "1");
    localStorage.setItem("hq:onboarded", "done");
    localStorage.setItem("hq:hints", "off");
  });
  await page.goto("/en?tier=lite");
  await waitForHQ(page);
  const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
  await expect(start).not.toHaveAttribute("aria-disabled", "true");
  await start.click();
  await waitForPhase(page, "explore", 60_000);
  await waitForSceneLive(page);
  await page.getByRole("navigation", { name: "Elevator" }).locator('[data-floor="L3"]').click();
  await waitForFloor(page, "L3", 180_000);
  expect(violations).toEqual([]);
});

test("a returning 3D visit with a floor deep link has no CSP violation", async ({ page }) => {
  const violations = await collectCspViolations(page);
  await asReturningVisitor(page);
  await enterHQ(page, { path: "/en/library" });
  expect(violations).toEqual([]);
});
