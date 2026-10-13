/** RIFF chunk tags of a WebP file, in order (VP8X, ALPH, VP8, EXIF, XMP, ...). */
export function webpChunks(file: Buffer): string[] {
  if (file.toString("latin1", 0, 4) !== "RIFF" || file.toString("latin1", 8, 12) !== "WEBP") throw new Error("not a WebP file");
  const tags: string[] = [];
  for (let at = 12; at + 8 <= file.length; ) {
    const size = file.readUInt32LE(at + 4);
    tags.push(file.toString("latin1", at, at + 4));
    at += 8 + size + (size % 2);
  }
  return tags;
}

/** Pixel size from the first chunk (VP8X canvas, lossy VP8 frame or lossless VP8L header). */
export function webpSize(file: Buffer): { width: number; height: number } {
  const tag = file.toString("latin1", 12, 16);
  if (tag === "VP8X") return { width: 1 + file.readUIntLE(24, 3), height: 1 + file.readUIntLE(27, 3) };
  if (tag === "VP8 ") return { width: file.readUInt16LE(26) & 0x3fff, height: file.readUInt16LE(28) & 0x3fff };
  if (tag === "VP8L") {
    const bits = file.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  throw new Error(`unknown WebP chunk ${tag}`);
}
