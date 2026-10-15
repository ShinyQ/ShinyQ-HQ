/**
 * Satori renders PNG; a photographic card is about 1 MB as PNG and about 110 KB as JPEG, so the
 * route re-encodes to JPEG (4:4:4 chroma keeps neon text edges clean) and steps the quality down
 * until the card fits the share budget (300 KB, with headroom).
 *
 * Link unfurlers decode these cards with many different JPEG libraries (LinkedIn, Slack, WhatsApp,
 * mail clients), so the file is the most conservative JPEG there is: baseline (sharp's mozjpeg
 * mode always writes progressive scans, so it stays off; trellis quantisation and optimised Huffman
 * tables keep the size) with a JFIF APP0 header, which libvips leaves out.
 */
import sharp from "sharp";

export const OG_JPEG_TARGET_BYTES = 290 * 1024;
const QUALITIES = [84, 80, 76, 72] as const;

/** JFIF 1.01 APP0 segment: no thumbnail, 1:1 pixel aspect ratio. */
const JFIF_APP0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);

/** Inserts a JFIF APP0 segment right after SOI unless the JPEG already starts with one. */
export function withJfifHeader(jpeg: Buffer): Buffer {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("not a JPEG");
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) return jpeg;
  return Buffer.concat([jpeg.subarray(0, 2), JFIF_APP0, jpeg.subarray(2)]);
}

/** True when the JPEG has a progressive frame (SOF2), false for baseline (SOF0). */
export function isProgressiveJpeg(jpeg: Uint8Array): boolean {
  let i = 2;
  while (i + 4 < jpeg.length) {
    if (jpeg[i] !== 0xff) return false;
    const marker = jpeg[i + 1];
    if (marker === 0xc2) return true;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xda) return false;
    i += 2 + ((jpeg[i + 2] << 8) | jpeg[i + 3]);
  }
  return false;
}

export async function encodeOgJpeg(png: Buffer): Promise<Buffer> {
  let jpeg: Buffer = Buffer.alloc(0);
  for (const quality of QUALITIES) {
    jpeg = withJfifHeader(
      await sharp(png)
        .flatten({ background: "#05050c" })
        .jpeg({ quality, chromaSubsampling: "4:4:4", progressive: false, optimiseCoding: true, trellisQuantisation: true, overshootDeringing: true })
        .toBuffer(),
    );
    if (jpeg.length <= OG_JPEG_TARGET_BYTES) return jpeg;
  }
  return jpeg;
}
