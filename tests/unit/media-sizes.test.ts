import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import { MID_WIDTH, imageSrcSet, midSrc, toGalleryImages } from "@/content/media";
import { webpChunks, webpSize } from "../helpers/webp";

describe("responsive project images", () => {
  it("list thumb, 1200 px and full widths in order", () => {
    expect(imageSrcSet({ src: "/media/a/01-x.webp", thumb: "/media/a/01-x.thumb.webp", mid: "/media/a/01-x.w1200.webp", width: 1600 })).toBe(
      "/media/a/01-x.thumb.webp 480w, /media/a/01-x.w1200.webp 1200w, /media/a/01-x.webp 1600w",
    );
    expect(imageSrcSet({ src: "/media/b/01-y.webp", thumb: "/media/b/01-y.thumb.webp", width: 1100 })).toBe("/media/b/01-y.thumb.webp 480w, /media/b/01-y.webp 1100w");
  });

  it("add the 1200 px rendition only to images wider than it", () => {
    const [wide, narrow] = toGalleryImages(
      [
        { src: "/media/a/01-x.webp", alt: { en: "a", id: "a" }, width: 1600, height: 1000, redacted: true },
        { src: "/media/a/02-y.webp", alt: { en: "b", id: "b" }, width: 1100, height: 700, redacted: true },
      ],
      "en",
    );
    expect(wide.mid).toBe("/media/a/01-x.w1200.webp");
    expect(narrow.mid).toBeUndefined();
    expect(midSrc("/media/a/01-x.webp")).toBe("/media/a/01-x.w1200.webp");
  });

  it("ship a 1200 px WebP without metadata for every pod image wider than 1200 px", () => {
    const issues: string[] = [];
    for (const pod of getContent().floors.labs.pods) {
      for (const asset of pod.assets.filter((a) => a.width > MID_WIDTH)) {
        const file = path.join(process.cwd(), "public", midSrc(asset.src));
        if (!existsSync(file)) {
          issues.push(`${midSrc(asset.src)} missing (bun scripts/media-sizes.ts)`);
          continue;
        }
        const bytes = readFileSync(file);
        const size = webpSize(bytes);
        if (size.width !== MID_WIDTH || Math.abs(size.height - Math.round((MID_WIDTH * asset.height) / asset.width)) > 1) issues.push(`${midSrc(asset.src)} is ${size.width}x${size.height}`);
        if (webpChunks(bytes).some((t) => t === "EXIF" || t === "XMP ")) issues.push(`${midSrc(asset.src)} carries metadata`);
      }
    }
    expect(issues).toEqual([]);
  });
});
