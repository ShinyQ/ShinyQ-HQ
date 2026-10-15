import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { OG_JPEG_TARGET_BYTES, encodeOgJpeg, isProgressiveJpeg, withJfifHeader } from "@/lib/og-encode";

describe("encodeOgJpeg", () => {
  it("turns the satori PNG into a 1200x630 JPEG within the share budget", async () => {
    const png = await sharp({ create: { width: 1200, height: 630, channels: 4, background: { r: 30, g: 20, b: 80, alpha: 1 } } }).png().toBuffer();
    const jpeg = await encodeOgJpeg(png);
    expect([...jpeg.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect(await sharp(jpeg).metadata()).toMatchObject({ format: "jpeg", width: 1200, height: 630 });
    expect(jpeg.length).toBeLessThanOrEqual(OG_JPEG_TARGET_BYTES);
  });

  it("writes a baseline JPEG that starts with a JFIF header, the safest format for link unfurlers", async () => {
    const png = await sharp({ create: { width: 1200, height: 630, channels: 3, background: { r: 5, g: 5, b: 12 } } }).png().toBuffer();
    const jpeg = await encodeOgJpeg(png);
    expect(jpeg.subarray(2, 4)).toEqual(Buffer.from([0xff, 0xe0]));
    expect(jpeg.subarray(6, 11).toString("latin1")).toBe("JFIF\0");
    expect(isProgressiveJpeg(jpeg)).toBe(false);
    expect(await sharp(jpeg).metadata()).toMatchObject({ isProgressive: false, chromaSubsampling: "4:4:4" });
  });
});

describe("withJfifHeader and isProgressiveJpeg", () => {
  it("adds the header once and detects progressive scans", async () => {
    const raw = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#123456" } }).jpeg({ progressive: true }).toBuffer();
    const once = withJfifHeader(raw);
    expect(withJfifHeader(once)).toBe(once);
    expect(isProgressiveJpeg(once)).toBe(true);
    expect(await sharp(once).metadata()).toMatchObject({ width: 8, height: 8 });
    expect(() => withJfifHeader(Buffer.from("png"))).toThrow();
  });
});
