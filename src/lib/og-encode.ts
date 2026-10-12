/**
 * Satori renders PNG; a photographic card is about 1 MB as PNG and about 110 KB as JPEG, so the
 * route re-encodes to JPEG (4:4:4 chroma keeps neon text edges clean) and steps the quality down
 * until the card fits the share budget (300 KB, with headroom).
 */
import sharp from "sharp";

export const OG_JPEG_TARGET_BYTES = 290 * 1024;
const QUALITIES = [84, 80, 76, 72] as const;

export async function encodeOgJpeg(png: Buffer): Promise<Buffer> {
  let jpeg = Buffer.alloc(0);
  for (const quality of QUALITIES) {
    jpeg = await sharp(png).flatten({ background: "#05050c" }).jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4", progressive: true }).toBuffer();
    if (jpeg.length <= OG_JPEG_TARGET_BYTES) return jpeg;
  }
  return jpeg;
}
