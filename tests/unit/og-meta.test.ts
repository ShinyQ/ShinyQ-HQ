import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { byteOffset, exportHtmlPath, jpegFormat, jpegSize, jsonLdBlocks, lateShareTags, parseSocialMeta, validateSocialMeta } from "../../scripts/og-meta";

const description = "d".repeat(150);
const HTML = [
  "<html><head>",
  "<title>Kurniadi Ahmad Wijaya: AI &amp; Software</title>",
  `<meta name="description" content="${description}"/>`,
  '<link rel="canonical" href="https://x.dev/en"/>',
  '<link rel="alternate" hrefLang="en" href="https://x.dev/en"/>',
  '<link rel="alternate" hrefLang="id" href="https://x.dev/id"/>',
  '<link rel="alternate" hrefLang="x-default" href="https://x.dev/en"/>',
  '<meta property="og:title" content="T"/>',
  '<meta property="og:description" content="D"/>',
  '<meta property="og:url" content="https://x.dev/en"/>',
  '<meta property="og:image" content="https://x.dev/og/en.jpg"/>',
  '<meta property="og:image:secure_url" content="https://x.dev/og/en.jpg"/>',
  '<meta property="og:image:type" content="image/jpeg"/>',
  '<meta property="og:image:width" content="1200"/>',
  '<meta property="og:image:height" content="630"/>',
  '<meta property="og:image:alt" content="T"/>',
  '<meta name="twitter:card" content="summary_large_image"/>',
  '<meta name="twitter:image" content="https://x.dev/og/en.jpg"/>',
  "</head><body><title>not this</title></body></html>",
].join("");

describe("og-meta", () => {
  it("reads the search and share tags from the head", () => {
    const meta = parseSocialMeta(HTML);
    expect(meta.title).toBe("Kurniadi Ahmad Wijaya: AI & Software");
    expect(meta.description).toBe(description);
    expect(meta.hreflang).toEqual({ en: "https://x.dev/en", id: "https://x.dev/id", "x-default": "https://x.dev/en" });
    expect(meta.og["og:image"]).toBe("https://x.dev/og/en.jpg");
    expect(validateSocialMeta(meta)).toEqual([]);
  });

  it("names every missing or wrong tag", () => {
    const html = HTML.replace(description, "short").replace('content="summary_large_image"', 'content="summary"').replace(/<link rel="alternate" hrefLang="id"[^>]*>/, "");
    expect(validateSocialMeta(parseSocialMeta(html))).toEqual([
      "description length 5 outside 140 to 160",
      "missing hreflang id",
      "twitter:card is not summary_large_image",
    ]);
  });

  it("requires og:url to equal the canonical and secure_url to match an https image", () => {
    const html = HTML.replace('og:url" content="https://x.dev/en"', 'og:url" content="https://x.dev/"').replace(/<meta property="og:image:secure_url"[^>]*>/, "");
    expect(validateSocialMeta(parseSocialMeta(html))).toEqual(["og:url differs from the canonical", "og:image:secure_url differs from og:image"]);
  });

  it("finds share tags past the first bytes, counting UTF-8 bytes", () => {
    expect(lateShareTags(HTML)).toEqual([]);
    expect(byteOffset("é<a>", "<a>")).toBe(2);
    const late = HTML.replace("<html><head>", `<html><head>${"<meta name=x>".repeat(700)}`);
    expect(lateShareTags(late)).toHaveLength(5);
    expect(lateShareTags("<head></head>")).toContain('missing property="og:image"');
  });

  it("tells baseline JFIF JPEGs from progressive ones and parses JSON-LD", async () => {
    const progressive = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } }).jpeg({ progressive: true }).toBuffer();
    expect(jpegFormat(progressive).baseline).toBe(false);
    const baseline = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } }).jpeg({ progressive: false }).toBuffer();
    expect(jpegFormat(baseline).baseline).toBe(true);
    expect(jsonLdBlocks('<script type="application/ld+json">[{"@type":"A"},{"@type":"B"}]</script><script type="application/ld+json">{"@type":"C"}</script>').map((d) => d["@type"])).toEqual(["A", "B", "C"]);
    expect(() => jsonLdBlocks('<script type="application/ld+json">{</script>')).toThrow();
  });

  it("reads JPEG dimensions and rejects other formats", async () => {
    const jpeg = await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#05050c" } }).jpeg({ progressive: true }).toBuffer();
    expect(jpegSize(jpeg)).toEqual({ width: 1200, height: 630 });
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).png().toBuffer();
    expect(jpegSize(png)).toBeNull();
  });

  it("maps page paths to exported HTML files", () => {
    expect(exportHtmlPath("out", "en", "/")).toBe("out/en.html");
    expect(exportHtmlPath("out", "id", "/labs/voice")).toBe("out/id/labs/voice.html");
  });
});
