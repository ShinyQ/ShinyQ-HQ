import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { collectCspViolations, expectStrictPolicy, openPage } from "./hq";
import { LOCALES, content, heroPod, staticRoutes } from "./routes";

for (const locale of LOCALES) {
  for (const route of staticRoutes(locale)) {
    test(`renders ${route}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // The per-page script policy (scripts/csp-hashes.ts): one strict data-hq-csp meta, and nothing the page runs
      // through hydration trips it (the other CSP cases are in e2e/csp.spec.ts).
      const violations = await collectCspViolations(page);
      const response = await openPage(page, route);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("h1").first()).toBeVisible();
      // /cv is the CV viewer (page images); every other page carries real text.
      expect((await page.locator("main").innerText()).length).toBeGreaterThan(route.endsWith("/cv") ? 40 : 200);
      await expectStrictPolicy(page);
      expect(violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test("hero pod page shows results and architecture", async ({ page }) => {
  await page.goto(`/en/labs/${heroPod.slug}`);
  await expect(page.locator("#results li").first()).toBeVisible();
  await expect(page.locator("#architecture")).toBeVisible();
});

test("language switch keeps the path", async ({ page }) => {
  await page.goto("/en/labs");
  await page.getByRole("navigation", { name: "Language" }).getByRole("link", { name: "ID" }).click();
  await expect(page).toHaveURL(/\/id\/labs$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
});

test("root redirects by browser language", async ({ browser }) => {
  const id = await browser.newContext({ locale: "id-ID" });
  const idPage = await id.newPage();
  await idPage.goto("/");
  await expect(idPage).toHaveURL(/\/id$/);
  await id.close();

  const en = await browser.newContext({ locale: "en-US" });
  const enPage = await en.newPage();
  await enPage.goto("/");
  await expect(enPage).toHaveURL(/\/en$/);
  await en.close();
});

test("root: the language redirect runs before the stylesheet; hreflang alternates stay", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const hoisted = html.indexOf("data-hq-hoisted");
  expect(hoisted).toBeGreaterThan(-1);
  expect(hoisted).toBeLessThan(html.indexOf('rel="stylesheet"'));
  for (const lang of ["en", "id", "x-default"]) expect(html).toMatch(new RegExp(`hreflang="${lang}"`, "i"));
});

test("unknown routes return the 404 page", async ({ page }) => {
  const response = await page.goto("/en/labs/does-not-exist");
  expect(response?.status()).toBe(404);
});

test("the owner's CV PDF is exported byte for byte, once for every locale", () => {
  const name = `${content.floors.roof.cv.fileName}.pdf`;
  const file = path.join("out", "cv", name);
  expect(existsSync(file), file).toBe(true);
  expect(readFileSync(file).equals(readFileSync(path.join("public", "cv", name)))).toBe(true);
  expect(readdirSync(path.join("out", "cv")).sort()).toEqual([name, "pages"]);
  // The CV viewer's page images (bun run cv:pages) are exported as they are committed.
  for (const page of readdirSync(path.join("public", "cv", "pages"))) {
    expect(readFileSync(path.join("out", "cv", "pages", page)).equals(readFileSync(path.join("public", "cv", "pages", page))), page).toBe(true);
  }
});
