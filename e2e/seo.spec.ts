import { expect, test } from "@playwright/test";
import { LOCALES, heroPod, hostedPost, staticRoutes } from "./routes";
import { OG_MAX_BYTES, jpegSize, parseSocialMeta, validateSocialMeta } from "../scripts/og-meta";

test("robots.txt and sitemap.xml are served with hreflang alternates", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  for (const locale of LOCALES) expect(xml).toContain(`/${locale}/labs/${heroPod.slug}</loc>`);
  expect(xml).toContain('hreflang="x-default"');
});

for (const locale of LOCALES) {
  test(`hero pod page has share metadata and structured data (${locale})`, async ({ page, request }) => {
    await page.goto(`/${locale}/labs/${heroPod.slug}`);
    await expect(page).toHaveTitle(/Kurniadi Ahmad Wijaya$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/${locale}/labs/${heroPod.slug}$`));
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");

    const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(ogImage).toMatch(new RegExp(`/og/${locale}/labs/${heroPod.slug}\\.jpg$`));
    const image = await request.get(new URL(ogImage!).pathname);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/jpeg");

    const types = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.flatMap((n) => [JSON.parse(n.textContent ?? "null")].flat().map((d) => d["@type"])));
    expect(types).toEqual(expect.arrayContaining(["Person", "WebSite", "CreativeWork", "BreadcrumbList"]));
  });
}

test("hosted blog post has a BlogPosting and its own share card", async ({ page }) => {
  test.skip(!hostedPost, "no hosted post");
  await page.goto(`/en/blog/${hostedPost!.slug}`);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`/og/en/blog/${hostedPost!.slug}\\.jpg$`));
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  const json = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(json.join("\n")).toContain('"BlogPosting"');
});

test("root language picker shares the default card", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toMatch(/property="og:image" content="[^"]+\/og\/en\.jpg"/);
});

for (const locale of LOCALES) {
  test(`sampled routes have a valid social card (${locale})`, async ({ request }) => {
    for (const route of staticRoutes(locale)) {
      const meta = parseSocialMeta(await (await request.get(route)).text());
      expect(validateSocialMeta(meta), route).toEqual([]);
      expect(meta.title, route).toContain("Kurniadi Ahmad Wijaya");
      const image = await request.get(new URL(meta.og["og:image"]).pathname);
      expect(image.status(), route).toBe(200);
      const bytes = await image.body();
      expect(jpegSize(bytes), route).toEqual({ width: 1200, height: 630 });
      expect(bytes.length, route).toBeLessThanOrEqual(OG_MAX_BYTES);
    }
  });
}
