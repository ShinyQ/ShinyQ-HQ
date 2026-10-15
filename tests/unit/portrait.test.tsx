import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Portrait } from "@/components/page/Portrait";
import { getProfile } from "@/content/load";
import { personJsonLd } from "@/lib/jsonld";
import { BRAND_PHOTO_WIDTHS, brandPhotoSrc, brandPhotoSrcSet } from "@/lib/brand-photo";
import { webpChunks, webpSize } from "../helpers/webp";

const pub = (src: string) => path.join(process.cwd(), "public", src);
/** The rover brand mark files (scripts/brand-marks.ts) and their README; everything else in public/brand is a photo. */
const BRAND_FILES = ["README.md", "rover-lockup-light.svg", "rover-lockup.svg", "rover-mark-glyph.svg", "rover-mark-mono.svg", "rover-mark.svg"];

describe("owner portrait (C5 revised 2026-10-13)", () => {
  it("ships square WebPs without metadata at every width", () => {
    for (const width of BRAND_PHOTO_WIDTHS) {
      const file = readFileSync(pub(brandPhotoSrc(width)));
      expect(webpSize(file), String(width)).toEqual({ width, height: width });
      expect(webpChunks(file).filter((t) => t === "EXIF" || t === "XMP "), String(width)).toEqual([]);
    }
    expect(brandPhotoSrcSet()).toBe("/brand/kurniadi-photo-160.webp 160w, /brand/kurniadi-photo-320.webp 320w, /brand/kurniadi-photo-640.webp 640w");
  });

  it("is the only photo in public/brand", () => {
    expect(readdirSync(pub("brand")).sort()).toEqual([...BRAND_FILES, ...BRAND_PHOTO_WIDTHS.map((w) => path.basename(brandPhotoSrc(w)))].sort());
  });

  it("renders round, named after the owner, lazy at low priority (never loads under the boot cover, never the LCP)", () => {
    const name = getProfile().name;
    const html = renderToStaticMarkup(<Portrait name={name} size={128} sizes="128px" />);
    expect(html).toContain(`alt="${name}"`);
    expect(html).toContain(`srcSet="${brandPhotoSrcSet()}"`);
    expect(html).toContain(`src="${brandPhotoSrc(320)}"`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('fetchPriority="low"');
    expect(html).toContain('width="128"');
    expect(html).toContain('height="128"');
    expect(html).toContain("pv-portrait");
  });

  it("is the Person image in JSON-LD (the share card photo, set by P9)", () => {
    expect(personJsonLd("en").image).toMatch(/\/og-assets\/kurniadi-photo\.png$/);
  });
});
