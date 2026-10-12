import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { OG_JPEG_TARGET_BYTES, encodeOgJpeg } from "@/lib/og-encode";

describe("encodeOgJpeg", () => {
  it("turns the satori PNG into a 1200x630 JPEG within the share budget", async () => {
    const png = await sharp({ create: { width: 1200, height: 630, channels: 4, background: { r: 30, g: 20, b: 80, alpha: 1 } } }).png().toBuffer();
    const jpeg = await encodeOgJpeg(png);
    expect([...jpeg.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect(await sharp(jpeg).metadata()).toMatchObject({ format: "jpeg", width: 1200, height: 630 });
    expect(jpeg.length).toBeLessThanOrEqual(OG_JPEG_TARGET_BYTES);
  });
});
